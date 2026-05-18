require('dotenv').config()

const pool = require('../utils/db')
const { deleteOssObject, getOssConfigFromEnv } = require('../utils/oss')

const THRESHOLD_MB = Math.max(1, Number(process.env.BUG_OSS_CLEANUP_THRESHOLD_MB || 10))
const APPLY_DELETE = String(process.env.BUG_OSS_CLEANUP_APPLY || '').toLowerCase() === 'true'

async function main() {
  const oss = getOssConfigFromEnv()
  if (!oss) {
    throw new Error('OSS 配置缺失')
  }

  const thresholdBytes = THRESHOLD_MB * 1024 * 1024
  const [rows] = await pool.query(
    `SELECT source, bug_id, bug_no, file_name, file_size, object_key, bucket_name
     FROM (
       SELECT '主附件' AS source, a.bug_id, b.bug_no, a.file_name, a.file_size, a.object_key, a.bucket_name
       FROM bug_attachments a
       LEFT JOIN bugs b ON b.id = a.bug_id
       UNION ALL
       SELECT '评论附件' AS source, a.bug_id, b.bug_no, a.file_name, a.file_size, a.object_key, a.bucket_name
       FROM bug_comment_attachments a
       LEFT JOIN bugs b ON b.id = a.bug_id
     ) t
     WHERE t.file_size >= ?
     ORDER BY t.file_size DESC, t.bug_id DESC, t.object_key ASC`,
    [thresholdBytes],
  )

  const uniqueRows = []
  const seen = new Set()
  for (const row of rows || []) {
    const key = String(row.object_key || '').trim()
    if (!key || seen.has(key)) continue
    seen.add(key)
    uniqueRows.push(row)
  }

  const summaryMb = uniqueRows.reduce((sum, row) => sum + Number(row.file_size || 0), 0) / 1024 / 1024
  console.log(JSON.stringify({
    threshold_mb: THRESHOLD_MB,
    count: uniqueRows.length,
    total_mb: Number(summaryMb.toFixed(2)),
    apply_delete: APPLY_DELETE,
  }, null, 2))

  for (const row of uniqueRows) {
    const objectKey = String(row.object_key || '').trim()
    if (!objectKey) continue
    if (!APPLY_DELETE) {
      console.log(`[DRY-RUN] ${row.bug_no || row.bug_id} ${row.file_name || ''} ${Number(row.file_size || 0)} ${objectKey}`)
      continue
    }
    const deleteResult = await deleteOssObject({
      accessKeyId: oss.accessKeyId,
      accessKeySecret: oss.accessKeySecret,
      bucketName: row.bucket_name || oss.bucketName,
      endpoint: oss.endpoint,
      objectKey,
      securityToken: oss.securityToken,
    })
    const ok = Boolean(deleteResult && deleteResult.ok)
    console.log(`${ok ? '[OK]' : '[FAIL]'} ${row.bug_no || row.bug_id} ${row.file_name || ''} ${Number(row.file_size || 0)} ${objectKey}`)
    if (!ok) {
      console.log(JSON.stringify(deleteResult, null, 2))
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error && error.stack ? error.stack : error)
    process.exit(1)
  })
