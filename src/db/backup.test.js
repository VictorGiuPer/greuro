import { describe, it, expect, beforeEach } from 'vitest'
import { db } from './db'
import { buildBackup, validateBackup, applyBackup } from './backup'
import { noon } from '../lib/dates'

async function clearAll() {
  await Promise.all(db.tables.map((t) => t.clear()))
}

async function seedFixture() {
  const checking = await db.accounts.add({ name: 'Checking', type: 'asset', startingBalance: 1000, expectedAnnualReturn: 0, createdAt: 1 })
  const savings = await db.accounts.add({ name: 'Savings', type: 'asset', startingBalance: 5000, expectedAnnualReturn: 3, createdAt: 1 })
  const food = await db.categories.add({ name: 'Food', kind: 'expense', color: '#fff', icon: 'Utensils', createdAt: 1 })
  await db.transactions.add({ type: 'expense', amount: 20, date: noon(2026, 5, 1), description: 'Lunch', categoryId: food, accountId: checking, fromAccountId: null, toAccountId: null, createdAt: 1, updatedAt: 1 })
  await db.transactions.add({ type: 'transfer', amount: 100, date: noon(2026, 5, 2), description: '', categoryId: null, accountId: null, fromAccountId: checking, toAccountId: savings, createdAt: 1, updatedAt: 1 })
  await db.scheduled.add({ type: 'expense', amount: 10, description: 'Sub', categoryId: food, accountId: checking, fromAccountId: null, toAccountId: null, recurrence: { unit: 'month', interval: 1 }, anchorDay: 5, startDate: noon(2026, 5, 5), nextDueDate: noon(2026, 6, 5), lastPostedDate: null, active: 1, createdAt: 1, updatedAt: 1 })
  await db.settings.put({ key: 'inflationRate', value: 3 })
  return { checking, savings, food }
}

beforeEach(clearAll)

describe('backup round-trip', () => {
  it('export → wipe → replace-import is lossless', async () => {
    await seedFixture()
    const before = {
      accounts: await db.accounts.toArray(),
      categories: await db.categories.toArray(),
      transactions: await db.transactions.toArray(),
      scheduled: await db.scheduled.toArray(),
      settings: await db.settings.toArray(),
    }

    // Serialize exactly like the file on disk.
    const json = JSON.parse(JSON.stringify(await buildBackup()))
    expect(validateBackup(json).ok).toBe(true)

    await clearAll()
    const imported = await applyBackup(json, 'replace')
    expect(imported.transactions).toBe(2)

    expect(await db.accounts.toArray()).toEqual(before.accounts)
    expect(await db.categories.toArray()).toEqual(before.categories)
    expect(await db.transactions.toArray()).toEqual(before.transactions)
    expect(await db.scheduled.toArray()).toEqual(before.scheduled)
    expect(await db.settings.toArray()).toEqual(before.settings)
  })
})

describe('merge mode', () => {
  it('reuses name-matched accounts/categories and remaps references', async () => {
    await seedFixture()
    const json = JSON.parse(JSON.stringify(await buildBackup()))

    // Fresh DB that already has a same-named account with a DIFFERENT id.
    await clearAll()
    const myChecking = await db.accounts.add({ name: 'checking', type: 'asset', startingBalance: 42, createdAt: 9 })

    const imported = await applyBackup(json, 'merge')
    expect(imported.accounts).toBe(1) // only Savings created; Checking reused
    expect(imported.categories).toBe(1)
    expect(imported.transactions).toBe(2)

    const accounts = await db.accounts.toArray()
    expect(accounts).toHaveLength(2)
    // The existing account was NOT overwritten.
    expect(accounts.find((a) => a.id === myChecking).startingBalance).toBe(42)

    // Transaction references point at the local ids now.
    const expense = (await db.transactions.toArray()).find((t) => t.type === 'expense')
    expect(expense.accountId).toBe(myChecking)
    const transfer = (await db.transactions.toArray()).find((t) => t.type === 'transfer')
    expect(transfer.fromAccountId).toBe(myChecking)
    const savingsId = accounts.find((a) => a.name === 'Savings').id
    expect(transfer.toAccountId).toBe(savingsId)

    // Settings untouched in merge mode.
    expect(await db.settings.count()).toBe(0)
  })
})

describe('validateBackup', () => {
  it('rejects foreign or malformed files', () => {
    expect(validateBackup(null).ok).toBe(false)
    expect(validateBackup({ format: 'other' }).ok).toBe(false)
    expect(
      validateBackup({ format: 'budget-app-backup', version: 99, data: {} }).ok,
    ).toBe(false)
    expect(
      validateBackup({
        format: 'budget-app-backup',
        version: 1,
        data: { accounts: [], categories: [], transactions: [{ bad: true }], scheduled: [], settings: [] },
      }).ok,
    ).toBe(false)
  })
})
