/**
 * Formatting + grouping helpers.
 *
 * LOCALE CONVENTION (app-wide, binding):
 *   - Currency: EUR only, German format — "1.234,56 €" (dot thousands,
 *     comma decimal, € suffix with a space).
 *   - Dates: European DD.MM.YYYY for numeric forms, but month NAMES are
 *     always ENGLISH ("20 May 2025", "May 2025").
 *   - Amount INPUTS accept comma as the decimal separator.
 */

const currency = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/** 1250 -> "1.250,00 €" (absolute value; sign is applied separately). */
export function formatAmount(amount) {
  return currency.format(Math.abs(Number(amount) || 0))
}

/**
 * Signed, prefixed amount string for a transaction type.
 *   expense  -> "-68,42 €"
 *   income   -> "+1.250,00 €"
 *   transfer -> "-500,00 €" (neutral; shown grey)
 */
export function signedAmount(type, amount) {
  const value = formatAmount(amount)
  if (type === 'income') return `+${value}`
  return `-${value}`
}

const numberFmt = new Intl.NumberFormat('de-DE', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/** 1250 -> "1.250,00" (no currency symbol; e.g. for chart axes with own unit). */
export function formatNumber(value) {
  return numberFmt.format(Number(value) || 0)
}

/**
 * Parse a German-style amount input string to a number.
 *   "1.234,56" -> 1234.56   "12,5" -> 12.5   "12.5" -> 12.5 (lone dot = decimal)
 * Rule: if a comma is present, dots are thousands separators (stripped);
 * without a comma a dot is treated as the decimal separator (desktop typing).
 * Returns NaN when the string is not a valid amount.
 */
export function parseAmountInput(raw) {
  const s = String(raw ?? '')
    .replace(/[\s €]/g, '')
    .trim()
  if (!s) return NaN
  let normalized
  if (s.includes(',')) {
    normalized = s.replace(/\./g, '').replace(',', '.')
  } else {
    normalized = s
  }
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) return NaN
  return Number(normalized)
}

/** Number -> plain editable input string with comma decimal ("14,7"). */
export function toAmountInputValue(value) {
  if (value == null || value === '') return ''
  const n = Number(value)
  if (!Number.isFinite(n)) return ''
  return String(n).replace('.', ',')
}

const dateFmt = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

/** ms timestamp -> "06.07.2026" (the app-wide short date format). */
export function formatDate(ts) {
  return dateFmt.format(new Date(ts))
}

// en-GB: European day-first order with English month names.
const dateHeaderFmt = new Intl.DateTimeFormat('en-GB', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
})

/** ms timestamp -> "20 May 2025" (day header; English month names). */
export function formatDateHeader(ts) {
  return dateHeaderFmt.format(new Date(ts))
}

const monthFmt = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' })

/** ms timestamp -> "May 2025" (month labels for reports). */
export function formatMonth(ts) {
  return monthFmt.format(new Date(ts))
}

/** ms timestamp -> "2025-05-20" local key for grouping by calendar day. */
export function dayKey(ts) {
  const d = new Date(ts)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

/** ms timestamp -> "2025-05-20" value for a native <input type="date">. */
export function toDateInputValue(ts) {
  return dayKey(ts)
}

/**
 * "2025-05-20" (from a date input) -> ms timestamp at local noon, so the row
 * groups under the intended day regardless of timezone.
 */
export function fromDateInputValue(value) {
  const [y, m, d] = value.split('-').map(Number)
  return new Date(y, m - 1, d, 12, 0, 0).getTime()
}

/**
 * Group an ordered (newest-first) list of transactions into
 * [{ key, label, items }] preserving order.
 */
export function groupByDay(transactions) {
  const groups = []
  const index = new Map()
  for (const t of transactions) {
    const key = dayKey(t.date)
    let group = index.get(key)
    if (!group) {
      group = { key, label: formatDateHeader(t.date), items: [] }
      index.set(key, group)
      groups.push(group)
    }
    group.items.push(t)
  }
  return groups
}
