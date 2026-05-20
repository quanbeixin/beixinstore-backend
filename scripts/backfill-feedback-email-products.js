const pool = require('../utils/db')

const PRODUCT_ALIAS_MAP = Object.freeze({
  a1: 'A1',
  beyo: 'Beyo',
  beatmo: 'Beatmo',
  couplelens: 'Couplelens',
  dradra: 'Dradra',
  facefame: 'Facefame',
  funpack: 'Funpack',
  gloglo: 'gloglo',
  heyo: 'Heyo',
  makmak: 'makmak',
  minimix: 'Minimix',
  popdoll: 'POPDoll',
  pixpop: 'Pixpop',
  usgen: 'Usgen',
  veeo: 'Veeo',
  vimi: 'Vimi',
  viyo: 'Viyo',
  zikzik: 'Zikzik',
})

const FALLBACK_PRODUCT = '未指定'

function normalizeAlias(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

function mapProductFromEmail(email) {
  const text = String(email || '').trim().toLowerCase()
  if (!text.includes('@')) return FALLBACK_PRODUCT
  const domain = text.split('@')[1] || ''
  const domainName = domain.split('.')[0] || ''
  const byDomain = PRODUCT_ALIAS_MAP[normalizeAlias(domainName)]
  if (byDomain) return byDomain
  const local = text.split('@')[0] || ''
  const byLocal = PRODUCT_ALIAS_MAP[normalizeAlias(local)]
  if (byLocal) return byLocal
  return FALLBACK_PRODUCT
}

async function main() {
  const [rows] = await pool.query(
    `SELECT id, product
     FROM user_feedback
     WHERE product REGEXP '^[^[:space:]@]+@[^[:space:]@]+\\.[^[:space:]@]+$'`,
  )

  if (!Array.isArray(rows) || rows.length === 0) {
    console.log('No email-like product rows found.')
    return
  }

  let updated = 0
  for (const row of rows) {
    const nextProduct = mapProductFromEmail(row.product)
    if (!nextProduct || nextProduct === row.product) continue
    const [result] = await pool.query(
      'UPDATE user_feedback SET product = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [nextProduct, row.id],
    )
    updated += Number(result?.affectedRows || 0)
  }

  console.log(`Scanned: ${rows.length}, Updated: ${updated}`)
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error && error.stack ? error.stack : error)
    process.exit(1)
  })
