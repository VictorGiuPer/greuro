import { describe, it, expect, beforeEach } from 'vitest'
import { db } from './db'
import { setAccountBalance, BALANCE_ADJUSTMENT_LABEL } from './accounts'
import { accountBalances, incomeExpenseTotals, cashFlow } from './derive'
import { addTransaction } from './transactions'
import { noon, todayNoon, monthRange } from '../lib/dates'

let checking, food

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
  checking = await db.accounts.add({ name: 'Checking', type: 'asset', startingBalance: 1000 })
  food = await db.categories.add({ name: 'Food', kind: 'expense', color: '#fff', icon: 'Utensils' })
  // Balance is now 1000 − 200 = 800.
  await addTransaction({
    type: 'expense', amount: 200, date: noon(2026, 0, 5),
    description: 'Groceries', categoryId: food, accountId: checking,
  })
})

describe('setAccountBalance', () => {
  it('books a negative adjustment when the real balance is lower', async () => {
    const res = await setAccountBalance(checking, 750)
    expect(res.changed).toBe(true)
    expect(res.delta).toBeCloseTo(-50, 6)

    const row = (await db.transactions.toArray()).find((t) => t.isAdjustment)
    expect(row).toMatchObject({
      type: 'expense', amount: 50, accountId: checking,
      description: BALANCE_ADJUSTMENT_LABEL, isAdjustment: 1, categoryId: null,
    })
    expect(row.date).toBe(todayNoon())
    // The account now reads exactly what was typed.
    expect((await accountBalances()).get(checking)).toBeCloseTo(750, 6)
  })

  it('books a positive adjustment when the real balance is higher', async () => {
    const res = await setAccountBalance(checking, 900)
    expect(res.delta).toBeCloseTo(100, 6)
    const row = (await db.transactions.toArray()).find((t) => t.isAdjustment)
    expect(row).toMatchObject({ type: 'income', amount: 100, isAdjustment: 1 })
    expect((await accountBalances()).get(checking)).toBeCloseTo(900, 6)
  })

  it('is a no-op when the balance already matches (no ledger noise)', async () => {
    const before = await db.transactions.count()
    const res = await setAccountBalance(checking, 800)
    expect(res.changed).toBe(false)
    expect(await db.transactions.count()).toBe(before)
  })

  it('ignores sub-cent drift', async () => {
    const res = await setAccountBalance(checking, 800.001)
    expect(res.changed).toBe(false)
  })

  it('the adjustment never shows up as income or spending', async () => {
    await setAccountBalance(checking, 900) // +100 income-shaped adjustment
    const now = new Date()
    const range = monthRange(now.getFullYear(), now.getMonth())
    expect((await incomeExpenseTotals(range)).income).toBe(0)
    expect((await cashFlow({ accountId: checking, ...range })).inflow).toBe(0)
  })

  it('rejects a non-numeric target', async () => {
    const res = await setAccountBalance(checking, NaN)
    expect(res.changed).toBe(false)
  })
})
