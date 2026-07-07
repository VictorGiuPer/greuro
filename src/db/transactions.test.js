import { describe, it, expect, beforeEach } from 'vitest'
import { db } from './db'
import { getTransactionsPage, addTransaction } from './transactions'
import { noon, startOfDayMs, endOfDayMs } from '../lib/dates'

let a1, a2, catFood, catPay

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
  a1 = await db.accounts.add({ name: 'Checking', type: 'asset', startingBalance: 0 })
  a2 = await db.accounts.add({ name: 'Savings', type: 'asset', startingBalance: 0 })
  catFood = await db.categories.add({ name: 'Food', kind: 'expense', color: '#fff', icon: 'Utensils' })
  catPay = await db.categories.add({ name: 'Pay', kind: 'income', color: '#fff', icon: 'Briefcase' })

  // 6 expenses on the SAME day (cursor tie-break exercise), plus income + transfers.
  for (let i = 0; i < 6; i++) {
    await addTransaction({
      type: 'expense', amount: 10 + i, date: noon(2026, 5, 10),
      description: `Cafe ${i}`, categoryId: catFood, accountId: a1,
    })
  }
  await addTransaction({ type: 'income', amount: 3000, date: noon(2026, 5, 12), description: 'Paycheck', categoryId: catPay, accountId: a1 })
  await addTransaction({ type: 'transfer', amount: 500, date: noon(2026, 5, 15), description: '', fromAccountId: a1, toAccountId: a2 })
  await addTransaction({ type: 'transfer', amount: 200, date: noon(2026, 5, 20), description: 'Top up', fromAccountId: a2, toAccountId: a1 })
  await addTransaction({ type: 'expense', amount: 99, date: noon(2026, 6, 1), description: 'July Cafe', categoryId: catFood, accountId: a1 })
})

async function collectAllPages(filters, limit = 2) {
  const all = []
  let before = null
  for (;;) {
    const page = await getTransactionsPage({ limit, before, filters })
    all.push(...page)
    if (page.length < limit) break
    const last = page[page.length - 1]
    before = { date: last.date, id: last.id }
  }
  return all
}

describe('getTransactionsPage filters', () => {
  it('paginates a filtered set with no dupes or skips (same-day ties)', async () => {
    const rows = await collectAllPages({ types: ['expense'] })
    expect(rows).toHaveLength(7)
    const ids = new Set(rows.map((r) => r.id))
    expect(ids.size).toBe(7)
    // Newest first throughout.
    for (let i = 1; i < rows.length; i++) {
      const prev = rows[i - 1]
      const cur = rows[i]
      expect(prev.date > cur.date || (prev.date === cur.date && prev.id > cur.id)).toBe(true)
    }
  })

  it('date range bounds are inclusive of full days', async () => {
    const rows = await collectAllPages({
      dateFrom: startOfDayMs(noon(2026, 5, 12)),
      dateTo: endOfDayMs(noon(2026, 5, 15)),
    })
    expect(rows.map((r) => r.description).sort()).toEqual(['', 'Paycheck'])
  })

  it('account filter matches transfers on either side', async () => {
    const rows = await collectAllPages({ accountIds: [a2] })
    expect(rows).toHaveLength(2)
    expect(rows.every((r) => r.type === 'transfer')).toBe(true)
  })

  it('filters combine (type + category + query + range)', async () => {
    const rows = await collectAllPages({
      types: ['expense'],
      categoryIds: [catFood],
      query: 'cafe',
      dateTo: endOfDayMs(noon(2026, 5, 30)),
    })
    expect(rows).toHaveLength(6) // the July one is excluded by dateTo
    expect(rows.every((r) => r.description.toLowerCase().includes('cafe'))).toBe(true)
  })

  it('empty filters return everything', async () => {
    const rows = await collectAllPages(null, 4)
    expect(rows).toHaveLength(10)
  })
})
