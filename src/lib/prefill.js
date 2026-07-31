/**
 * Android auto-fill: turn an incoming amount (from a share/notification hook)
 * into a number to seed a new transaction. greuro is the "landing pad"; the
 * notification reading itself is done by an OS automation app (Tasker), which
 * opens greuro either via `?amount=…` or by sharing the notification text.
 */

const round2 = (n) => Math.round(n * 100) / 100

/** Parse one amount token, tolerating "1,234.56" and "1.234,56". */
function parseAmountToken(raw) {
  let s = String(raw ?? '').replace(/[^\d.,-]/g, '')
  if (!s) return NaN
  const lastComma = s.lastIndexOf(',')
  const lastDot = s.lastIndexOf('.')
  if (lastComma !== -1 && lastDot !== -1) {
    // The rightmost separator is the decimal one.
    if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.')
    else s = s.replace(/,/g, '')
  } else if (lastComma !== -1) {
    s = s.replace(/\./g, '').replace(',', '.')
  }
  const n = Number(s)
  return Number.isFinite(n) ? n : NaN
}

/**
 * Pull a monetary amount out of arbitrary notification/share text, e.g.
 * "You paid €12.50 to Bakery" or "Bezahlt 12,50 € an X". Prefers a number
 * next to a currency symbol, else the first number with a decimal part.
 * @returns {number|null}
 */
export function extractAmount(text) {
  const str = String(text ?? '')
  if (!str) return null

  const currency = str.match(
    /(?:€|£|\$|EUR|USD|GBP)\s?([\d][\d.,\s]*\d|\d)|([\d][\d.,\s]*\d|\d)\s?(?:€|£|\$|EUR|USD|GBP)/i,
  )
  if (currency) {
    const n = parseAmountToken(currency[1] || currency[2])
    if (Number.isFinite(n) && n > 0) return round2(n)
  }

  const candidates = str.match(/\d[\d.,\s]*\d|\d/g) || []
  let firstPositive = null
  for (const c of candidates) {
    const n = parseAmountToken(c)
    if (!Number.isFinite(n) || n <= 0) continue
    if (/[.,]\d/.test(c)) return round2(n) // has decimals → most likely the amount
    if (firstPositive == null) firstPositive = n
  }
  return firstPositive != null ? round2(firstPositive) : null
}

/**
 * Read a prefill amount from a URL query string.
 *   - `?amount=12,50`  (Tasker "Browse URL")
 *   - `?text=…&title=…` (Web Share Target)
 * @returns {{ amount:number }|null}
 */
export function parsePrefillFromSearch(search) {
  const params = new URLSearchParams(search || '')
  if (params.has('amount')) {
    const n = parseAmountToken(params.get('amount'))
    if (Number.isFinite(n) && n > 0) return { amount: round2(n) }
  }
  const shared = [params.get('text'), params.get('title'), params.get('url')]
    .filter(Boolean)
    .join(' ')
  if (shared) {
    const amt = extractAmount(shared)
    if (amt) return { amount: amt }
  }
  return null
}
