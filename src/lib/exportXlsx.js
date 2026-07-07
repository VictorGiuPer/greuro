import { db } from '../db/db'
import { accountBalances } from '../db/derive'
import { formatDate } from './format'

/**
 * Excel export — fully in-browser via SheetJS (dynamically imported so the
 * ~400 kB library stays out of the startup bundle). Dates are exported as
 * DD.MM.YYYY strings; amounts as real numbers with a EUR cell format so they
 * stay computable in Excel.
 */

const EUR_FMT = '#,##0.00 "€"'

async function loadXLSX() {
  const mod = await import('xlsx')
  return mod.default ?? mod
}

/** Apply the EUR number format to the given 0-based columns of a sheet. */
function applyEuroFormat(XLSX, ws, cols, rowCount) {
  for (let r = 1; r <= rowCount; r++) {
    for (const c of cols) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })]
      if (cell && typeof cell.v === 'number') cell.z = EUR_FMT
    }
  }
}

/** Signed amount per the money convention (transfer shown negative-neutral). */
function signedValue(t) {
  return t.type === 'income' ? t.amount : -t.amount
}

function txRow(t, categoriesById, accountsById) {
  const cat = t.categoryId != null ? categoriesById.get(t.categoryId)?.name : ''
  const acct = t.accountId != null ? (accountsById.get(t.accountId)?.name ?? '') : ''
  const from = t.fromAccountId != null ? (accountsById.get(t.fromAccountId)?.name ?? '') : ''
  const to = t.toAccountId != null ? (accountsById.get(t.toAccountId)?.name ?? '') : ''
  return [
    formatDate(t.date),
    t.type,
    t.description,
    cat,
    t.type === 'transfer' ? `${from} → ${to}` : acct,
    signedValue(t),
  ]
}

const TX_HEADER = ['Date', 'Type', 'Description', 'Category', 'Account', 'Amount']

function buildTxSheet(XLSX, txs, categoriesById, accountsById) {
  const rows = txs.map((t) => txRow(t, categoriesById, accountsById))
  const ws = XLSX.utils.aoa_to_sheet([TX_HEADER, ...rows])
  ws['!cols'] = [{ wch: 11 }, { wch: 9 }, { wch: 28 }, { wch: 16 }, { wch: 22 }, { wch: 12 }]
  applyEuroFormat(XLSX, ws, [5], rows.length)
  return ws
}

function monthKey(ts) {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

async function fetchAll() {
  const [accounts, categories, txs] = await Promise.all([
    db.accounts.toArray(),
    db.categories.toArray(),
    db.transactions.orderBy('[date+id]').reverse().toArray(),
  ])
  return {
    accounts,
    categories,
    txs,
    categoriesById: new Map(categories.map((c) => [c.id, c])),
    accountsById: new Map(accounts.map((a) => [a.id, a])),
  }
}

function download(XLSX, wb, filename) {
  XLSX.writeFile(wb, filename, { compression: true })
}

/** One-tap full export: Transactions · Monthly Summary · By Category · By Account. */
export async function exportAllWorkbook() {
  const XLSX = await loadXLSX()
  const { accounts, categories, txs, categoriesById, accountsById } = await fetchAll()
  const wb = XLSX.utils.book_new()

  // 1. All transactions.
  XLSX.utils.book_append_sheet(wb, buildTxSheet(XLSX, txs, categoriesById, accountsById), 'Transactions')

  // 2. Monthly summary (one pass over all transactions).
  const months = new Map()
  for (const t of txs) {
    if (t.type === 'transfer') continue
    const key = monthKey(t.date)
    const m = months.get(key) ?? { income: 0, expense: 0 }
    if (t.type === 'income') m.income += t.amount
    else m.expense += t.amount
    months.set(key, m)
  }
  const monthRows = [...months.entries()]
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .map(([key, m]) => [key, m.income, m.expense, m.income - m.expense])
  const wsMonths = XLSX.utils.aoa_to_sheet([
    ['Month', 'Income', 'Expenses', 'Net'],
    ...monthRows,
  ])
  wsMonths['!cols'] = [{ wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 12 }]
  applyEuroFormat(XLSX, wsMonths, [1, 2, 3], monthRows.length)
  XLSX.utils.book_append_sheet(wb, wsMonths, 'Monthly Summary')

  // 3. By category (all time).
  const catTotals = new Map()
  for (const t of txs) {
    if (t.type === 'transfer') continue
    const entry = catTotals.get(t.categoryId) ?? { total: 0, count: 0 }
    entry.total += t.amount
    entry.count += 1
    catTotals.set(t.categoryId, entry)
  }
  const catRows = categories
    .map((c) => {
      const e = catTotals.get(c.id) ?? { total: 0, count: 0 }
      return [c.name, c.kind, e.total, e.count]
    })
    .sort((a, b) => b[2] - a[2])
  const wsCats = XLSX.utils.aoa_to_sheet([
    ['Category', 'Kind', 'Total', 'Transactions'],
    ...catRows,
  ])
  wsCats['!cols'] = [{ wch: 18 }, { wch: 9 }, { wch: 12 }, { wch: 12 }]
  applyEuroFormat(XLSX, wsCats, [2], catRows.length)
  XLSX.utils.book_append_sheet(wb, wsCats, 'By Category')

  // 4. By account: lifetime in/out (transfers count) + current balance.
  const flows = new Map(accounts.map((a) => [a.id, { in: 0, out: 0 }]))
  for (const t of txs) {
    if (t.type === 'income') flows.get(t.accountId) && (flows.get(t.accountId).in += t.amount)
    else if (t.type === 'expense') flows.get(t.accountId) && (flows.get(t.accountId).out += t.amount)
    else {
      flows.get(t.fromAccountId) && (flows.get(t.fromAccountId).out += t.amount)
      flows.get(t.toAccountId) && (flows.get(t.toAccountId).in += t.amount)
    }
  }
  const balances = await accountBalances()
  const acctRows = accounts.map((a) => {
    const f = flows.get(a.id)
    return [a.name, a.type, f.in, f.out, balances.get(a.id) ?? 0]
  })
  const wsAccts = XLSX.utils.aoa_to_sheet([
    ['Account', 'Type', 'Inflow', 'Outflow', 'Balance'],
    ...acctRows,
  ])
  wsAccts['!cols'] = [{ wch: 18 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 12 }]
  applyEuroFormat(XLSX, wsAccts, [2, 3, 4], acctRows.length)
  XLSX.utils.book_append_sheet(wb, wsAccts, 'By Account')

  download(XLSX, wb, `budget-export-${new Date().toISOString().slice(0, 10)}.xlsx`)
}

/** Export a given list of transactions (e.g. the current filtered view). */
export async function exportTransactionRows(txs, categoriesById, accountsById, name = 'filtered') {
  const XLSX = await loadXLSX()
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, buildTxSheet(XLSX, txs, categoriesById, accountsById), 'Transactions')
  download(XLSX, wb, `budget-${name}-${new Date().toISOString().slice(0, 10)}.xlsx`)
}

/** Export one monthly report (as produced by derive.monthlyReport). */
export async function exportMonthlyReport(report, monthLabel, categoriesById) {
  const XLSX = await loadXLSX()
  const wb = XLSX.utils.book_new()
  const rows = [
    ['Monthly Report', monthLabel],
    [],
    ['Income', report.totals.income],
    ['Expenses', report.totals.expense],
    ['Net', report.totals.net],
    [],
    ['Vs previous month'],
    ['Income Δ', report.delta.income],
    ['Expenses Δ', report.delta.expense],
    ['Net Δ', report.delta.net],
    [],
    ['Net worth start', report.netWorthStart],
    ['Net worth end', report.netWorthEnd],
    ['Net worth change', report.netWorthChange],
    [],
    ['Top categories'],
    ...report.topCategories.map((c) => [
      categoriesById.get(c.categoryId)?.name ?? 'Uncategorized',
      c.total,
    ]),
  ]
  const ws = XLSX.utils.aoa_to_sheet(rows)
  ws['!cols'] = [{ wch: 22 }, { wch: 14 }]
  applyEuroFormat(XLSX, ws, [1], rows.length)
  XLSX.utils.book_append_sheet(wb, ws, 'Report')
  download(XLSX, wb, `budget-report-${monthLabel.replace(/\s+/g, '-')}.xlsx`)
}
