const http = require('http')
const https = require('https')
const { TextDecoder } = require('util')
const iconv = require('iconv-lite')
const MatrixPackage = require('../models/MatrixPackage')
const MatrixPackageSideNote = require('../models/MatrixPackageSideNote')
const NotificationTemplateFile = require('../models/NotificationTemplateFile')
const {
  buildSignedGetObjectUrl,
  getOssConfigFromEnv,
} = require('../utils/oss')

const DATA_SAFETY_TEMPLATE_KEY = 'date-safe-file'
const ACCOUNT_DELETION_ROW_KEY = 'PSL_ACCOUNT_DELETION_URL'
const MAX_TEMPLATE_FILE_SIZE = 20 * 1024 * 1024

function normalizeText(value, maxLen = 2000) {
  return String(value || '').trim().slice(0, maxLen)
}

function parseJsonObject(value) {
  try {
    const parsed = JSON.parse(String(value || ''))
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function parseCsvText(text = '') {
  const rows = []
  let currentRow = []
  let currentCell = ''
  let inQuotes = false
  let index = 0

  while (index < text.length) {
    const char = text[index]
    const nextChar = text[index + 1]

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        currentCell += '"'
        index += 2
        continue
      }
      if (char === '"') {
        inQuotes = false
        index += 1
        continue
      }
      currentCell += char
      index += 1
      continue
    }

    if (char === '"') {
      inQuotes = true
      index += 1
      continue
    }

    if (char === ',') {
      currentRow.push(currentCell)
      currentCell = ''
      index += 1
      continue
    }

    if (char === '\n') {
      currentRow.push(currentCell)
      rows.push(currentRow)
      currentRow = []
      currentCell = ''
      index += 1
      continue
    }

    if (char === '\r') {
      index += 1
      continue
    }

    currentCell += char
    index += 1
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell)
    rows.push(currentRow)
  }

  return rows
}

function stringifyCsvRows(rows = []) {
  const escapeCsvCell = (value) => {
    const text = String(value ?? '')
    if (/[",\n\r]/.test(text)) {
      return `"${text.replace(/"/g, '""')}"`
    }
    return text
  }

  return `${rows.map((row) => row.map(escapeCsvCell).join(',')).join('\r\n')}\r\n`
}

function isUtf8(buffer) {
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(buffer)
    return true
  } catch {
    return false
  }
}

function decodeTemplate(buffer) {
  if (isUtf8(buffer)) {
    return {
      encoding: 'utf8',
      text: buffer.toString('utf8'),
    }
  }

  return {
    encoding: 'gb18030',
    text: iconv.decode(buffer, 'gb18030'),
  }
}

function encodeTemplate(text, encoding) {
  if (encoding === 'gb18030') {
    return iconv.encode(text, 'gb18030')
  }
  return Buffer.from(text, 'utf8')
}

function downloadUrlToBuffer(url) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url)
    const client = parsedUrl.protocol === 'http:' ? http : https
    const req = client.get(parsedUrl, (res) => {
      const statusCode = Number(res.statusCode || 0)
      if (statusCode >= 300 && statusCode < 400 && res.headers.location) {
        res.resume()
        const redirectedUrl = new URL(res.headers.location, parsedUrl).toString()
        downloadUrlToBuffer(redirectedUrl).then(resolve).catch(reject)
        return
      }

      if (statusCode < 200 || statusCode >= 300) {
        res.resume()
        reject(new Error(`模板下载失败(${statusCode || 'UNKNOWN'})`))
        return
      }

      const chunks = []
      let totalSize = 0
      res.on('data', (chunk) => {
        totalSize += chunk.length
        if (totalSize > MAX_TEMPLATE_FILE_SIZE) {
          req.destroy(new Error('模板文件超过大小限制'))
          return
        }
        chunks.push(chunk)
      })
      res.on('end', () => resolve(Buffer.concat(chunks)))
    })

    req.on('error', reject)
    req.setTimeout(30000, () => req.destroy(new Error('模板下载超时')))
  })
}

function buildTemplateDownloadUrl(templateRow) {
  const oss = getOssConfigFromEnv()
  const objectKey = normalizeText(templateRow?.object_key, 1000).replace(/^\/+/, '')
  if (oss && objectKey) {
    return buildSignedGetObjectUrl({
      accessKeyId: oss.accessKeyId,
      accessKeySecret: oss.accessKeySecret,
      bucketName: normalizeText(templateRow?.bucket_name, 100) || oss.bucketName,
      endpoint: oss.endpoint,
      objectKey,
      expireSeconds: oss.expireSeconds,
      securityToken: oss.securityToken,
      responseContentDisposition: 'attachment',
    })
  }
  return normalizeText(templateRow?.object_url, 2000)
}

async function resolveDataDeletionUrl(packageId, overrideUrl = '') {
  const normalizedOverride = normalizeText(overrideUrl, 2000)
  if (normalizedOverride) return normalizedOverride

  const notes = await MatrixPackageSideNote.listByPackageId(packageId)
  const operationNote = Array.isArray(notes) ? notes.find((item) => item.note_type === 'OPERATION') : null
  const operationContent = parseJsonObject(operationNote?.content || operationNote?.confirmed_content || '')
  return normalizeText(operationContent.dataDeletionUrl, 2000)
}

async function generateDataSafetyFile(packageId, { dataDeletionUrl: overrideDataDeletionUrl = '' } = {}) {
  const detail = await MatrixPackage.getById(packageId)
  if (!detail) {
    const err = new Error('matrix_package_not_found')
    err.statusCode = 404
    err.message = '矩阵包不存在'
    throw err
  }

  const dataDeletionUrl = await resolveDataDeletionUrl(detail.id, overrideDataDeletionUrl)
  if (!dataDeletionUrl) {
    const err = new Error('data_deletion_url_required')
    err.statusCode = 400
    err.message = '请先补充运营侧的“数据删除说明网址”'
    throw err
  }

  const templateRow = await NotificationTemplateFile.getByKey(DATA_SAFETY_TEMPLATE_KEY)
  const templateUrl = buildTemplateDownloadUrl(templateRow)
  if (!templateUrl) {
    const err = new Error('data_safety_template_required')
    err.statusCode = 400
    err.message = '请先在通用文件模板里上传数据安全文件模板'
    throw err
  }

  const templateBuffer = await downloadUrlToBuffer(templateUrl)
  const decoded = decodeTemplate(templateBuffer)
  const rows = parseCsvText(decoded.text)
  if (!rows.length) {
    const err = new Error('data_safety_template_empty')
    err.statusCode = 400
    err.message = '模板文件内容为空'
    throw err
  }

  const targetRow = rows.find((row) => row.some((cell) => normalizeText(cell, 255) === ACCOUNT_DELETION_ROW_KEY))
  if (!targetRow) {
    const err = new Error('data_safety_template_row_missing')
    err.statusCode = 400
    err.message = '模板中未找到 PSL_ACCOUNT_DELETION_URL 行'
    throw err
  }

  while (targetRow.length < 3) {
    targetRow.push('')
  }
  targetRow[2] = dataDeletionUrl

  const csvContent = stringifyCsvRows(rows)
  const buffer = encodeTemplate(csvContent, decoded.encoding)
  const packageName = normalizeText(detail.package_name, 255) || 'matrix-package'
  const safeFileName = packageName.replace(/[\\/:*?"<>|]+/g, '-')

  return {
    buffer,
    encoding: decoded.encoding,
    fileName: `${safeFileName}-数据安全文件.csv`,
  }
}

module.exports = {
  generateDataSafetyFile,
}
