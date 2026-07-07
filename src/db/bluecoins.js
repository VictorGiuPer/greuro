import { db } from './db'
import { noon } from '../lib/dates'

/**
 * BlueCoins migration importer — pure parsing/mapping logic. The UI reads the
 * file with SheetJS (CSV or XLSX), hands the rows here, shows the preview,
 * and only then calls commitBlueCoinsImport(). Nothing is written before the
 * user confirms the preview.
 *
 * BlueCoins peculiarity: transfers are exported as PAIRED rows (type
 * "Transfer", one negative = source, one positive = destination). We pair
 * them by (day, |amount|) into single transfer rows; unpairable rows are
 * reported as skipped.
 */

export const TARGET_FIELDS = [
  { id: 'date', label: 'Date', required: true },
  { id: 'amount', label: 'Amount', required: true },
  { id: 'type', label: 'Type', required: false },
  { id: 'description', label: 'Description', required: false },
  { id: 'category', label: 'Category', required: false },
  { id: 'account', label: 'Account', required: false },
  { id: 'notes', label: 'Notes', required: false },
]

// Common BlueCoins export header names, most specific first.
const DETECT = {
  date: [/^date$/i, /date/i],
  type: [/^type$/i, /^transaction ?type$/i],
  description: [/^item ?(or ?payee)?$/i, /^title$/i, /payee/i, /item/i, /description/i, /^name$/i],
  amount: [/^amount$/i, /amount/i],
  category: [/^category$/i, /^parent ?category$/i, /category/i],
  account: [/^account$/i, /account/i],
  notes: [/^notes?$/i, /note/i],
}

/** headers: string[] -> { field: headerName|null } */
export function autoDetectMapping(headers) {
  const mapping = {}
  const taken = new Set()
  for (const field of TARGET_FIELDS.map((f) => f.id)) {
    mapping[field] = null
    for (const pattern of DETECT[field]) {
      const hit = headers.find((h) => !taken.has(h) && pattern.test(String(h).trim()))
      if (hit) {
        mapping[field] = hit
        taken.add(hit)
        break
      }
    }
  }
  return mapping
}

/** Flexible amount parser: handles 1,234.56 · 1.234,56 · -12,5 · plain numbers. */
export function parseFlexibleAmount(value) {
  if (typeof value === 'number') return value
  let s = String(value ?? '').replace(/[^\d.,-]/g, '')
  if (!s) return NaN
  const lastComma = s.lastIndexOf(',')
  const lastDot = s.lastIndexOf('.')
  if (lastComma !== -1 && lastDot !== -1) {
    // Both present: the LAST separator is the decimal one.
    if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.')
    else s = s.replace(/,/g, '')
  } else if (lastComma !== -1) {
    s = s.replace(/\./g, '').replace(',', '.')
  }
  const n = Number(s)
  return Number.isFinite(n) ? n : NaN
}

const EXCEL_EPOCH_OFFSET_DAYS = 25569 // days between 1900-01-00 and 1970-01-01

/**
 * Parse a date cell to local-noon ms. Accepts Date objects (XLSX cellDates),
 * Excel serials, ISO strings, DD.MM.YYYY, and slash dates.
 * @param order 'DMY' | 'MDY' — how to read ambiguous slash dates
 */
export function parseFlexibleDate(value, order = 'DMY') {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return noon(value.getFullYear(), value.getMonth(), value.getDate())
  }
  if (typeof value === 'number' && value > 20000 && value < 80000) {
    const d = new Date(Math.round((value - EXCEL_EPOCH_OFFSET_DAYS) * 86400000))
    return noon(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  }
  const s = String(value ?? '').trim()
  let m
  if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) {
    return noon(+m[1], +m[2] - 1, +m[3])
  }
  if ((m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/))) {
    return noon(+m[3], +m[2] - 1, +m[1])
  }
  if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/))) {
    let [, a, b, y] = m
    a = +a
    b = +b
    y = +y < 100 ? 2000 + +y : +y
    // Disambiguate: a value > 12 pins its position.
    let day
    let month
    if (a > 12) [day, month] = [a, b]
    else if (b > 12) [day, month] = [b, a]
    else if (order === 'MDY') [day, month] = [b, a]
    else [day, month] = [a, b]
    return noon(y, month - 1, day)
  }
  return null
}

function classifyType(raw, amount) {
  const s = String(raw ?? '').trim().toLowerCase()
  if (/^(transfer|übertrag|umbuchung)/.test(s)) return 'transfer'
  if (/^(expense|ausgabe|withdrawal)/.test(s)) return 'expense'
  if (/^(income|einnahme|deposit)/.test(s)) return 'income'
  // No usable type column: derive from the sign.
  return amount < 0 ? 'expense' : 'income'
}

/**
 * Parse mapped rows into importable transactions.
 * @param rows    array of objects keyed by header (SheetJS sheet_to_json)
 * @param mapping { field: headerName|null } — date + amount required
 * @param options { dateOrder: 'DMY'|'MDY' }
 * @returns {{ parsed: object[], skipped: {index:number, reason:string}[] }}
 */
export function parseBlueCoinsRows(rows, mapping, { dateOrder = 'DMY' } = {}) {
  const get = (row, field) => (mapping[field] != null ? row[mapping[field]] : undefined)
  const parsed = []
  const skipped = []
  const transferQueue = new Map() // "day|abs" -> { neg: [...], pos: [...] }

  rows.forEach((row, index) => {
    const date = parseFlexibleDate(get(row, 'date'), dateOrder)
    if (date == null) {
      skipped.push({ index, reason: 'Unreadable date' })
      return
    }
    const rawAmount = parseFlexibleAmount(get(row, 'amount'))
    if (!Number.isFinite(rawAmount) || rawAmount === 0) {
      skipped.push({ index, reason: 'Unreadable or zero amount' })
      return
    }
    const type = classifyType(get(row, 'type'), rawAmount)
    const description = String(get(row, 'description') ?? '').trim()
    const notes = String(get(row, 'notes') ?? '').trim()
    const category = String(get(row, 'category') ?? '').trim() || null
    const account = String(get(row, 'account') ?? '').trim() || null

    if (type === 'transfer') {
      const key = `${date}|${Math.abs(rawAmount)}`
      const bucket = transferQueue.get(key) ?? { neg: [], pos: [] }
      bucket[rawAmount < 0 ? 'neg' : 'pos'].push({ index, date, description, notes, account })
      transferQueue.set(key, bucket)
      return
    }

    parsed.push({
      type,
      amount: Math.abs(rawAmount),
      date,
      description: description || notes,
      category,
      account,
    })
  })

  // Pair transfer halves (FIFO within each day+amount bucket).
  for (const [key, bucket] of transferQueue) {
    const amount = Number(key.split('|')[1])
    const n = Math.min(bucket.neg.length, bucket.pos.length)
    for (let i = 0; i < n; i++) {
      const out = bucket.neg[i]
      const inn = bucket.pos[i]
      parsed.push({
        type: 'transfer',
        amount,
        date: out.date,
        description: out.description || inn.description || '',
        category: null,
        fromAccount: out.account,
        toAccount: inn.account,
      })
    }
    for (const leftover of [...bucket.neg.slice(n), ...bucket.pos.slice(n)]) {
      skipped.push({ index: leftover.index, reason: 'Unpaired transfer row' })
    }
  }

  parsed.sort((a, b) => a.date - b.date)
  return { parsed, skipped }
}

const DEFAULT_COLORS = [
  '#2EE8C6', '#6EE7B7', '#60A5FA', '#F59E0B', '#A78BFA',
  '#6366F1', '#F472B6', '#FBBF24', '#F87171',
]

const nameKey = (s) => String(s ?? '').trim().toLowerCase()

/** What commit would create — for the preview screen. */
export async function planBlueCoinsImport(parsed, accountDefs = null) {
  const existingAccounts = await db.accounts.toArray()
  const existingCategories = await db.categories.toArray()
  const haveAccount = new Set(existingAccounts.map((a) => nameKey(a.name)))
  const haveCategory = new Set(existingCategories.map((c) => `${nameKey(c.name)}|${c.kind}`))

  const newAccounts = new Set()
  const newCategories = new Set()
  for (const t of parsed) {
    for (const name of [t.account, t.fromAccount, t.toAccount]) {
      const key = nameKey(name || 'Imported')
      if (!haveAccount.has(key)) newAccounts.add(name || 'Imported')
    }
    if (t.category && t.type !== 'transfer') {
      const kind = t.type
      if (!haveCategory.has(`${nameKey(t.category)}|${kind}`)) newCategories.add(`${t.category} (${kind})`)
    }
  }
  // .fydb path: every BlueCoins account is created (with its opening balance),
  // even ones no imported transaction references.
  if (accountDefs) {
    for (const def of accountDefs.values()) {
      if (!haveAccount.has(nameKey(def.name))) newAccounts.add(def.name)
    }
  }
  return { newAccounts: [...newAccounts], newCategories: [...newCategories] }
}

/**
 * Write parsed rows, creating missing accounts/categories on the fly
 * (default colors/icons — editable later in Settings).
 *
 * @param accountDefs optional Map<lowercased name, {name, type, startingBalance}>
 *        (from the .fydb parser) so created accounts carry their real
 *        asset/liability type and opening balance instead of defaults.
 */
export async function commitBlueCoinsImport(parsed, accountDefs = null) {
  let accountsCreated = 0
  let categoriesCreated = 0

  await db.transaction('rw', db.accounts, db.categories, db.transactions, async () => {
    const now = Date.now()
    const accounts = await db.accounts.toArray()
    const categories = await db.categories.toArray()
    const accountIdByName = new Map(accounts.map((a) => [nameKey(a.name), a.id]))
    const categoryIdByKey = new Map(categories.map((c) => [`${nameKey(c.name)}|${c.kind}`, c.id]))

    async function ensureAccount(name) {
      const label = (name ?? '').trim() || 'Imported'
      const key = nameKey(label)
      if (accountIdByName.has(key)) return accountIdByName.get(key)
      const def = accountDefs?.get(key)
      const id = await db.accounts.add({
        name: label,
        type: def?.type ?? 'asset',
        startingBalance: def?.startingBalance ?? 0,
        expectedAnnualReturn: 0,
        createdAt: now,
        updatedAt: now,
      })
      accountIdByName.set(key, id)
      accountsCreated += 1
      return id
    }

    async function ensureCategory(name, kind) {
      if (!name) return null
      const key = `${nameKey(name)}|${kind}`
      if (categoryIdByKey.has(key)) return categoryIdByKey.get(key)
      const id = await db.categories.add({
        name: name.trim(),
        kind,
        color: DEFAULT_COLORS[categoriesCreated % DEFAULT_COLORS.length],
        icon: 'Circle',
        createdAt: now,
        updatedAt: now,
      })
      categoryIdByKey.set(key, id)
      categoriesCreated += 1
      return id
    }

    // Create every known BlueCoins account up front (carries opening
    // balances for accounts that have no imported transactions).
    if (accountDefs) {
      for (const def of accountDefs.values()) await ensureAccount(def.name)
    }

    for (const t of parsed) {
      if (t.type === 'transfer') {
        await db.transactions.add({
          type: 'transfer',
          amount: t.amount,
          date: t.date,
          description: t.description,
          categoryId: null,
          accountId: null,
          fromAccountId: await ensureAccount(t.fromAccount),
          toAccountId: await ensureAccount(t.toAccount),
          createdAt: now,
          updatedAt: now,
        })
      } else {
        await db.transactions.add({
          type: t.type,
          amount: t.amount,
          date: t.date,
          description: t.description,
          categoryId: await ensureCategory(t.category, t.type),
          accountId: await ensureAccount(t.account),
          fromAccountId: null,
          toAccountId: null,
          createdAt: now,
          updatedAt: now,
        })
      }
    }
  })

  return { imported: parsed.length, accountsCreated, categoriesCreated }
}
