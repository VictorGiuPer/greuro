import { db } from './db'
import { noon } from '../lib/dates'

export const RUSSELSHEIM_SOURCE_TAG = 'ruesselsheim-monthly-budget-v1'
export const RUSSELSHEIM_ACCOUNT_NAME = 'Rüsselsheim historical spending'

const CATEGORY_HEADERS = ['Miete', 'Einkaufen', 'Mensa', 'Rest']
const MONTHS = new Map([
  ['januar', 0],
  ['februar', 1],
  ['märz', 2],
  ['maerz', 2],
  ['april', 3],
  ['mai', 4],
  ['juni', 5],
  ['juli', 6],
  ['august', 7],
  ['september', 8],
  ['oktober', 9],
  ['november', 10],
  ['dezember', 11],
])
const DEFAULT_COLORS = ['#2EE8C6', '#6EE7B7', '#60A5FA', '#F59E0B', '#A78BFA']

const cellAddress = (XLSX, row, col) => XLSX.utils.encode_cell({ r: row, c: col })
const nameKey = (value) => String(value ?? '').trim().toLocaleLowerCase()
const cleanHeader = (value) => nameKey(value).replace(/\?+$/, '')

function monthIndex(value) {
  return MONTHS.get(nameKey(value)) ?? null
}

function headerMap(ws, XLSX, group) {
  const map = new Map()
  for (let col = group.startCol; col <= group.endCol; col += 1) {
    const header = cleanHeader(ws[cellAddress(XLSX, group.headerRow, col)]?.v)
    if (header) map.set(header, col)
  }
  return map
}

function firstFormulaRow(ws, XLSX, group, headers) {
  const categoryCols = CATEGORY_HEADERS.map((header) => headers.get(cleanHeader(header))).filter(
    (col) => col != null,
  )
  if (categoryCols.length === 0) return null
  const endRow = XLSX.utils.decode_range(ws['!ref']).e.r
  for (let row = group.headerRow + 1; row <= endRow; row += 1) {
    if (categoryCols.some((col) => ws[cellAddress(XLSX, row, col)]?.f)) return row
  }
  return null
}

function buildSheetLayout(ws, XLSX, sheetName, sheetIndex) {
  const groups = (ws['!merges'] ?? [])
    .map((merge) => {
      const month = monthIndex(ws[cellAddress(XLSX, merge.s.r, merge.s.c)]?.v)
      if (month == null) return null
      return {
        month,
        startCol: merge.s.c,
        endCol: merge.e.c,
        headerRow: merge.s.r + 1,
      }
    })
    .filter(Boolean)
    .sort((a, b) => a.startCol - b.startCol)

  if (groups.length === 0) return null

  const months = []
  for (const group of groups) {
    const headers = headerMap(ws, XLSX, group)
    const hasCore = ['miete', 'einkaufen', 'rest'].every((header) => headers.has(header))
    const descriptionCol = headers.get('wofür')
    const summaryRow = firstFormulaRow(ws, XLSX, group, headers)
    if (!hasCore || descriptionCol == null || summaryRow == null) return null
    months.push({
      ...group,
      headers,
      descriptionCol,
      dataStartRow: group.headerRow + 1,
      dataEndRow: summaryRow - 1,
    })
  }

  return {
    sheetName,
    sheetIndex,
    firstMonth: months[0].month,
    lastMonth: months.at(-1).month,
    months,
  }
}

/**
 * Detect the annual-budget sheets in an XLSX workbook. The layout is anchored
 * by merged German month headings so the offset used by the first month can
 * vary between sheets.
 */
export function detectRusselsheimWorkbook(XLSX, workbook, referenceYear = new Date().getFullYear()) {
  const sheets = workbook.SheetNames.map((sheetName, sheetIndex) => {
    const ws = workbook.Sheets[sheetName]
    return ws?.['!ref'] ? buildSheetLayout(ws, XLSX, sheetName, sheetIndex) : null
  }).filter(Boolean)

  if (sheets.length === 0) {
    throw new Error(
      'No supported monthly budget sheet found. Expected merged German month headings with Miete, Einkaufen, Rest and Wofür columns.',
    )
  }

  const firstYear = referenceYear - sheets.length
  return sheets.map((sheet, index) => ({ ...sheet, defaultStartYear: firstYear + index }))
}

function parseAmount(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : NaN
  const text = String(value ?? '')
    .replace(/[^\d,.-]/g, '')
    .trim()
  if (!text) return NaN
  const comma = text.lastIndexOf(',')
  const dot = text.lastIndexOf('.')
  const normalized =
    comma !== -1 && dot !== -1
      ? comma > dot
        ? text.replace(/\./g, '').replace(',', '.')
        : text.replace(/,/g, '')
      : text.replace(',', '.')
  const amount = Number(normalized)
  return Number.isFinite(amount) ? amount : NaN
}

function sheetYears(months, startYear) {
  let year = startYear
  let previousMonth = months[0].month
  return months.map((month, index) => {
    if (index > 0 && month.month < previousMonth) year += 1
    previousMonth = month.month
    return year
  })
}

/** Extract importable expense transactions after the user confirms start years. */
export function parseRusselsheimWorkbook(XLSX, workbook, layouts, startYears) {
  const parsed = []
  const skipped = []

  for (const layout of layouts) {
    const startYear = Number(startYears[layout.sheetName])
    if (!Number.isInteger(startYear) || startYear < 1900 || startYear > 2400) {
      throw new Error(`Enter a valid start year for ${layout.sheetName}.`)
    }
    const ws = workbook.Sheets[layout.sheetName]
    const years = sheetYears(layout.months, startYear)

    layout.months.forEach((month, monthPosition) => {
      for (let row = month.dataStartRow; row <= month.dataEndRow; row += 1) {
        for (const category of CATEGORY_HEADERS) {
          const column = month.headers.get(cleanHeader(category))
          if (column == null) continue
          const address = cellAddress(XLSX, row, column)
          const cell = ws[address]
          if (!cell || cell.f) continue
          const raw = cell.v
          if (raw == null || raw === '') continue
          const amount = parseAmount(raw)
          if (!Number.isFinite(amount)) {
            skipped.push({ sheetName: layout.sheetName, address, reason: 'Unreadable amount' })
            continue
          }
          if (amount <= 0) continue

          const description =
            category === 'Rest'
              ? String(ws[cellAddress(XLSX, row, month.descriptionCol)]?.v ?? '').trim() || 'Rest'
              : category
          parsed.push({
            type: 'expense',
            amount,
            date: noon(years[monthPosition], month.month, 1),
            description,
            category,
            sourceKey: `${RUSSELSHEIM_SOURCE_TAG}:${layout.sheetIndex}:${address}`,
            sheetName: layout.sheetName,
            address,
          })
        }
      }
    })
  }

  parsed.sort((a, b) => a.date - b.date || a.sourceKey.localeCompare(b.sourceKey))
  return { parsed, skipped, totalAmount: parsed.reduce((sum, row) => sum + row.amount, 0) }
}

/** What the preview will add, including source-cell duplicates it will skip. */
export async function planRusselsheimImport(parsed) {
  const [accounts, categories, existingImported] = await Promise.all([
    db.accounts.toArray(),
    db.categories.toArray(),
    parsed.length
      ? db.transactions.where('importKey').anyOf(parsed.map((row) => row.sourceKey)).toArray()
      : Promise.resolve([]),
  ])
  const alreadyImported = new Set(existingImported.map((row) => row.importKey))
  const ready = parsed.filter((row) => !alreadyImported.has(row.sourceKey))
  const categoryKeys = new Set(categories.map((category) => `${nameKey(category.name)}|${category.kind}`))
  const newCategories = [...new Set(ready.map((row) => row.category))].filter(
    (name) => !categoryKeys.has(`${nameKey(name)}|expense`),
  )
  const account = accounts.find((row) => row.sourceTag === RUSSELSHEIM_SOURCE_TAG) ?? null

  return {
    ready,
    duplicates: parsed.length - ready.length,
    totalAmount: ready.reduce((sum, row) => sum + row.amount, 0),
    newCategories,
    accountExists: Boolean(account),
  }
}

/**
 * Commit the non-duplicate source cells and keep the dedicated historical
 * account neutral by increasing its opening balance by the new expenses.
 */
export async function commitRusselsheimImport(parsed) {
  let imported = 0
  let duplicates = 0
  let categoriesCreated = 0
  let accountCreated = false

  await db.transaction('rw', db.accounts, db.categories, db.transactions, async () => {
    const existingImported = parsed.length
      ? await db.transactions.where('importKey').anyOf(parsed.map((row) => row.sourceKey)).toArray()
      : []
    const knownKeys = new Set(existingImported.map((row) => row.importKey))
    const ready = parsed.filter((row) => !knownKeys.has(row.sourceKey))
    duplicates = parsed.length - ready.length
    if (ready.length === 0) return

    const now = Date.now()
    const accounts = await db.accounts.toArray()
    let account = accounts.find((row) => row.sourceTag === RUSSELSHEIM_SOURCE_TAG)
    const totalAmount = ready.reduce((sum, row) => sum + row.amount, 0)
    if (!account) {
      const id = await db.accounts.add({
        name: RUSSELSHEIM_ACCOUNT_NAME,
        type: 'asset',
        usage: 'active',
        startingBalance: totalAmount,
        expectedAnnualReturn: 0,
        sourceTag: RUSSELSHEIM_SOURCE_TAG,
        createdAt: now,
        updatedAt: now,
      })
      account = { id, startingBalance: totalAmount }
      accountCreated = true
    } else {
      await db.accounts.update(account.id, {
        startingBalance: (Number(account.startingBalance) || 0) + totalAmount,
        updatedAt: now,
      })
    }

    const categories = await db.categories.toArray()
    const categoryIds = new Map(
      categories
        .filter((category) => category.kind === 'expense')
        .map((category) => [nameKey(category.name), category.id]),
    )
    for (const categoryName of [...new Set(ready.map((row) => row.category))]) {
      const key = nameKey(categoryName)
      if (categoryIds.has(key)) continue
      const id = await db.categories.add({
        name: categoryName,
        kind: 'expense',
        color: DEFAULT_COLORS[categoriesCreated % DEFAULT_COLORS.length],
        icon: 'Circle',
        createdAt: now,
        updatedAt: now,
      })
      categoryIds.set(key, id)
      categoriesCreated += 1
    }

    await db.transactions.bulkAdd(
      ready.map((row) => ({
        type: 'expense',
        amount: row.amount,
        date: row.date,
        description: row.description,
        categoryId: categoryIds.get(nameKey(row.category)) ?? null,
        accountId: account.id,
        fromAccountId: null,
        toAccountId: null,
        importKey: row.sourceKey,
        createdAt: now,
        updatedAt: now,
      })),
    )
    imported = ready.length
  })

  return { imported, duplicates, categoriesCreated, accountCreated }
}
