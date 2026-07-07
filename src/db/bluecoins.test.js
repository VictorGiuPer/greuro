import { describe, it, expect, beforeEach } from 'vitest'
import { db } from './db'
import {
  autoDetectMapping,
  parseFlexibleAmount,
  parseFlexibleDate,
  parseBlueCoinsRows,
  commitBlueCoinsImport,
} from './bluecoins'
import { noon } from '../lib/dates'

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

describe('autoDetectMapping', () => {
  it('detects common BlueCoins headers', () => {
    const headers = ['Type', 'Date', 'Item or Payee', 'Amount', 'Currency', 'Category', 'Account', 'Notes']
    expect(autoDetectMapping(headers)).toMatchObject({
      date: 'Date',
      type: 'Type',
      description: 'Item or Payee',
      amount: 'Amount',
      category: 'Category',
      account: 'Account',
      notes: 'Notes',
    })
  })
  it('prefers "Category" over "Parent Category"', () => {
    const m = autoDetectMapping(['Parent Category', 'Category', 'Date', 'Amount'])
    expect(m.category).toBe('Category')
  })
})

describe('parseFlexibleAmount / parseFlexibleDate', () => {
  it('handles both decimal conventions and currency junk', () => {
    expect(parseFlexibleAmount('1,234.56')).toBe(1234.56)
    expect(parseFlexibleAmount('1.234,56')).toBe(1234.56)
    expect(parseFlexibleAmount('-12,5')).toBe(-12.5)
    expect(parseFlexibleAmount('€ 42')).toBe(42)
    expect(parseFlexibleAmount('abc')).toBeNaN()
  })
  it('handles ISO, German dots, slashes and Excel serials', () => {
    expect(parseFlexibleDate('2026-07-06')).toBe(noon(2026, 6, 6))
    expect(parseFlexibleDate('06.07.2026')).toBe(noon(2026, 6, 6))
    expect(parseFlexibleDate('06/07/2026', 'DMY')).toBe(noon(2026, 6, 6))
    expect(parseFlexibleDate('07/06/2026', 'MDY')).toBe(noon(2026, 6, 6))
    expect(parseFlexibleDate('25/12/2026', 'MDY')).toBe(noon(2026, 11, 25)) // >12 pins it
    expect(parseFlexibleDate(45108)).toBe(noon(2023, 6, 1)) // 2023-07-01
    expect(parseFlexibleDate('garbage')).toBeNull()
  })
})

const MAPPING = {
  date: 'Date',
  type: 'Type',
  description: 'Item or Payee',
  amount: 'Amount',
  category: 'Category',
  account: 'Account',
  notes: 'Notes',
}

const FIXTURE = [
  { Date: '2026-07-01', Type: 'Expense', 'Item or Payee': 'Grocery', Amount: '-45,30', Category: 'Food', Account: 'Checking', Notes: '' },
  { Date: '2026-07-02', Type: 'Income', 'Item or Payee': 'Salary', Amount: '3.000,00', Category: 'Salary', Account: 'Checking', Notes: '' },
  // Transfer pair
  { Date: '2026-07-03', Type: 'Transfer', 'Item or Payee': 'To savings', Amount: '-500', Category: '(Transfer)', Account: 'Checking', Notes: '' },
  { Date: '2026-07-03', Type: 'Transfer', 'Item or Payee': 'To savings', Amount: '500', Category: '(Transfer)', Account: 'Savings', Notes: '' },
  // Unpaired transfer
  { Date: '2026-07-04', Type: 'Transfer', 'Item or Payee': 'Orphan', Amount: '-100', Category: '(Transfer)', Account: 'Checking', Notes: '' },
  // Bad row
  { Date: 'not a date', Type: 'Expense', 'Item or Payee': 'Broken', Amount: '10', Category: '', Account: '', Notes: '' },
]

describe('parseBlueCoinsRows', () => {
  it('parses, pairs transfers, and reports skips with reasons', () => {
    const { parsed, skipped } = parseBlueCoinsRows(FIXTURE, MAPPING)
    expect(parsed).toHaveLength(3)
    expect(skipped).toHaveLength(2)
    expect(skipped.map((s) => s.reason).sort()).toEqual(['Unpaired transfer row', 'Unreadable date'])

    const transfer = parsed.find((t) => t.type === 'transfer')
    expect(transfer).toMatchObject({
      amount: 500,
      date: noon(2026, 6, 3),
      fromAccount: 'Checking',
      toAccount: 'Savings',
    })
    const expense = parsed.find((t) => t.type === 'expense')
    expect(expense).toMatchObject({ amount: 45.3, category: 'Food', account: 'Checking' })
  })

  it('derives type from the sign when no type column is mapped', () => {
    const rows = [
      { Date: '2026-07-01', Amount: '-20', 'Item or Payee': 'Shop' },
      { Date: '2026-07-01', Amount: '99', 'Item or Payee': 'Refund' },
    ]
    const { parsed } = parseBlueCoinsRows(rows, { ...MAPPING, type: null, category: null, account: null, notes: null })
    expect(parsed.map((p) => p.type).sort()).toEqual(['expense', 'income'])
  })
})

describe('commitBlueCoinsImport', () => {
  it('creates missing accounts/categories and writes transactions', async () => {
    // Pre-existing account should be reused, not duplicated.
    await db.accounts.add({ name: 'Checking', type: 'asset', startingBalance: 0 })

    const { parsed } = parseBlueCoinsRows(FIXTURE, MAPPING)
    const res = await commitBlueCoinsImport(parsed)

    expect(res.imported).toBe(3)
    expect(res.accountsCreated).toBe(1) // Savings only
    expect(res.categoriesCreated).toBe(2) // Food (expense), Salary (income)

    expect(await db.transactions.count()).toBe(3)
    const transfer = (await db.transactions.toArray()).find((t) => t.type === 'transfer')
    const accounts = await db.accounts.toArray()
    const savings = accounts.find((a) => a.name === 'Savings')
    expect(transfer.toAccountId).toBe(savings.id)
    const salaryCat = (await db.categories.toArray()).find((c) => c.name === 'Salary')
    expect(salaryCat.kind).toBe('income')
  })
})
