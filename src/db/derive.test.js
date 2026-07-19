import { describe, it, expect, beforeEach } from 'vitest'
import { db } from './db'
import {
  accountBalances,
  netWorthAt,
  cashFlow,
  spendingByCategory,
  incomeExpenseTotals,
  monthlyReport,
} from './derive'
import { noon } from '../lib/dates'

let checking, savings, loan, food, rent, salary

async function clearAll() {
  await Promise.all(db.tables.map((t) => t.clear()))
}

beforeEach(async () => {
  await clearAll()
  checking = await db.accounts.add({ name: 'Checking', type: 'asset', startingBalance: 1000, expectedAnnualReturn: 0 })
  savings = await db.accounts.add({ name: 'Savings', type: 'asset', startingBalance: 5000, expectedAnnualReturn: 3 })
  loan = await db.accounts.add({ name: 'Loan', type: 'liability', startingBalance: 2000, expectedAnnualReturn: 0 })
  food = await db.categories.add({ name: 'Food', kind: 'expense', color: '#fff', icon: 'Utensils' })
  rent = await db.categories.add({ name: 'Rent', kind: 'expense', color: '#fff', icon: 'Home' })
  salary = await db.categories.add({ name: 'Salary', kind: 'income', color: '#fff', icon: 'Briefcase' })

  await db.transactions.bulkAdd([
    // May 2026
    { type: 'income', amount: 3000, date: noon(2026, 4, 1), description: 'Pay', categoryId: salary, accountId: checking, fromAccountId: null, toAccountId: null },
    { type: 'expense', amount: 800, date: noon(2026, 4, 2), description: 'Rent', categoryId: rent, accountId: checking, fromAccountId: null, toAccountId: null },
    { type: 'expense', amount: 200, date: noon(2026, 4, 10), description: 'Groceries', categoryId: food, accountId: checking, fromAccountId: null, toAccountId: null },
    { type: 'transfer', amount: 500, date: noon(2026, 4, 15), description: '', categoryId: null, accountId: null, fromAccountId: checking, toAccountId: savings },
    { type: 'transfer', amount: 300, date: noon(2026, 4, 20), description: 'Loan payment', categoryId: null, accountId: null, fromAccountId: checking, toAccountId: loan },
    // June 2026
    { type: 'income', amount: 3000, date: noon(2026, 5, 1), description: 'Pay', categoryId: salary, accountId: checking, fromAccountId: null, toAccountId: null },
    { type: 'expense', amount: 900, date: noon(2026, 5, 3), description: 'Rent', categoryId: rent, accountId: checking, fromAccountId: null, toAccountId: null },
  ])
})

describe('accountBalances', () => {
  it('applies the sign convention per account', async () => {
    const b = await accountBalances()
    // checking: 1000 +3000 -800 -200 -500 -300 +3000 -900 = 4300
    expect(b.get(checking)).toBe(4300)
    expect(b.get(savings)).toBe(5500)
    // liability starts at -2000; +300 payment -> -1700 (owes 1700)
    expect(b.get(loan)).toBe(-1700)
  })
  it('respects the as-of date', async () => {
    const b = await accountBalances(noon(2026, 4, 5)) // through May 5
    expect(b.get(checking)).toBe(1000 + 3000 - 800)
    expect(b.get(savings)).toBe(5000)
  })
})

describe('netWorthAt', () => {
  it('sums assets minus liabilities', async () => {
    expect(await netWorthAt()).toBe(4300 + 5500 - 1700)
  })
  it('transfers are net-worth neutral (incl. debt paydown)', async () => {
    const before = await netWorthAt(noon(2026, 4, 14))
    const after = await netWorthAt(noon(2026, 4, 21))
    expect(after).toBe(before) // only the two transfers happened in between
  })
})

describe('cashFlow', () => {
  it('counts transfers in and out', async () => {
    const may = { from: noon(2026, 4, 1), to: noon(2026, 4, 31) }
    const cf = await cashFlow({ accountId: checking, ...may })
    expect(cf.inflow).toBe(3000)
    expect(cf.outflow).toBe(800 + 200 + 500 + 300)
    expect(cf.net).toBe(3000 - 1800)
    const sv = await cashFlow({ accountId: savings, ...may })
    expect(sv.inflow).toBe(500)
    expect(sv.outflow).toBe(0)
  })
})

describe('spendingByCategory', () => {
  it('groups expenses, excludes transfers, sorts desc', async () => {
    const may = { from: noon(2026, 4, 1), to: noon(2026, 4, 31) }
    const rows = await spendingByCategory(may)
    expect(rows).toEqual([
      { categoryId: rent, total: 800 },
      { categoryId: food, total: 200 },
    ])
  })
})

describe('incomeExpenseTotals', () => {
  it('excludes transfers', async () => {
    const may = { from: noon(2026, 4, 1), to: noon(2026, 4, 31) }
    expect(await incomeExpenseTotals(may)).toEqual({ income: 3000, expense: 1000, net: 2000 })
  })
})

describe('monthlyReport', () => {
  it('computes totals, MoM delta and net-worth change', async () => {
    const r = await monthlyReport(2026, 5) // June
    expect(r.totals).toEqual({ income: 3000, expense: 900, net: 2100 })
    expect(r.prevTotals).toEqual({ income: 3000, expense: 1000, net: 2000 })
    expect(r.delta.net).toBe(100)
    expect(r.netWorthChange).toBe(2100) // June net (transfers neutral)
    expect(r.topCategories[0]).toEqual({ categoryId: rent, total: 900 })
  })
})

describe('balance-only (excludeFromStats) categories', () => {
  it('adjustment expense hits balances but is invisible to stats', async () => {
    // A quarterly correction: -400 on checking, in an excluded category.
    const adjust = await db.categories.add({
      name: 'Adjustment', kind: 'expense', color: '#fff', icon: 'Circle', excludeFromStats: true,
    })
    await db.transactions.add({
      type: 'expense', amount: 400, date: noon(2026, 4, 25), description: 'Q2 adjust',
      categoryId: adjust, accountId: checking, fromAccountId: null, toAccountId: null,
    })

    const may = { from: noon(2026, 4, 1), to: noon(2026, 4, 31) }
    // Cash flow / spending / net earnings ignore it.
    const cf = await cashFlow({ accountId: checking, ...may })
    expect(cf.outflow).toBe(800 + 200 + 500 + 300) // no +400
    expect((await spendingByCategory(may)).some((r) => r.categoryId === adjust)).toBe(false)
    expect((await incomeExpenseTotals(may)).expense).toBe(1000) // no +400
    // But the balance / net worth DID move by -400.
    expect((await accountBalances()).get(checking)).toBe(4300 - 400)
    expect(await netWorthAt()).toBe(4300 - 400 + 5500 - 1700)
  })
})
