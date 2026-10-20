import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CloudDatabase } from './cloudDatabase'
import { getTransactionsPage } from './transactions'
import { spendingByCategory } from './derive'
import { monthRange, noon } from '../lib/dates'
import { createTransactionFilters } from '../lib/transactionFilters'

const fixture = vi.hoisted(() => ({ database: null }))
vi.mock('./db', () => ({ get db() { return fixture.database } }))

let original, client
beforeEach(async () => {
  // Deliberately neither date- nor ID-ordered, as imports and backdated entries
  // need not be inserted chronologically. Include same-day ties across pages.
  const transactions = Array.from({ length: 75 }, (_, i) => ({
    id: 75 - i,
    date: noon(2026, 5 + (i % 3), 1 + (i % 4)),
    type: 'expense', amount: 10, categoryId: 1 + (i % 2), accountId: 1 + (i % 2),
    description: `Purchase ${i}`,
  }))
  original = {
    format: 'budget-app-backup', version: 1, exportedAt: 'unchanged',
    data: { transactions, accounts: [{ id: 1 }, { id: 2 }], categories: [
      { id: 1, kind: 'expense' }, { id: 2, kind: 'expense' },
    ], scheduled: [], settings: [], goals: [], trips: [] },
  }
  client = {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({
      data: { data: structuredClone(original), updated_at: 'revision-1' }, error: null,
    }) }) }) }),
    rpc: vi.fn(),
  }
  fixture.database = new CloudDatabase(client)
  await fixture.database.initialize('user-1')
})

async function allPages(filters) {
  const rows = []
  let before = null
  for (let n = 0; n < 20; n++) {
    const page = await getTransactionsPage({ limit: 7, before, filters })
    rows.push(...page)
    if (page.length < 7) return rows
    before = { date: page.at(-1).date, id: page.at(-1).id }
  }
  throw new Error('Pagination did not finish')
}

const newestFirst = (rows) => [...rows].sort((a, b) => b.date - a.date || b.id - a.id)

describe('cloud transaction views', () => {
  it('returns every imported transaction across pages regardless of insertion order', async () => {
    const rows = await allPages(createTransactionFilters())
    expect(rows).toEqual(newestFirst(original.data.transactions))
    expect(new Set(rows.map((row) => row.id)).size).toBe(75)
  })

  it('summarising June leaves July and August available and never writes data', async () => {
    const range = monthRange(2026, 5)
    const summary = await spendingByCategory(range)
    expect(summary.reduce((total, category) => total + category.total, 0)).toBe(250)
    const rows = await allPages(createTransactionFilters())
    expect(rows.filter((row) => new Date(row.date).getMonth() >= 6)).toHaveLength(50)
    expect(await fixture.database.transactions.toArray()).toEqual(original.data.transactions)
    expect(client.rpc).not.toHaveBeenCalled()
  })

  it('applies explicit Transactions filters and clearing them restores all pages', async () => {
    const range = monthRange(2026, 5)
    const filtered = await allPages({
      ...createTransactionFilters(), dateFrom: range.from, dateTo: range.to,
      categoryIds: [1], accountIds: [1],
    })
    expect(filtered).toEqual(newestFirst(original.data.transactions.filter((row) =>
      row.date >= range.from && row.date <= range.to && row.categoryId === 1)))
    expect(await allPages(createTransactionFilters())).toHaveLength(75)
    expect(client.rpc).not.toHaveBeenCalled()
  })
})
