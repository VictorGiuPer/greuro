import { describe, it, expect, beforeEach, vi } from 'vitest'
import { db } from './db'
import { buildBackup, validateBackup, applyBackup } from './backup'
import { CloudDatabase } from './cloudDatabase'
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
  await db.goals.add({ name: 'Trip', targetAmount: 3000, startYear: 2026, startMonth: 0, archived: 0, createdAt: 1, updatedAt: 1 })
  const trip = await db.trips.add({ name: 'Japan', days: 10, archived: 0, createdAt: 1, updatedAt: 1 })
  await db.transactions.add({ type: 'expense', amount: 80, date: noon(2026, 5, 3), description: 'Ramen', categoryId: food, accountId: checking, fromAccountId: null, toAccountId: null, tripId: trip, createdAt: 1, updatedAt: 1 })
  return { checking, savings, food, trip }
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
      goals: await db.goals.toArray(),
      trips: await db.trips.toArray(),
    }

    // Serialize exactly like the file on disk.
    const json = JSON.parse(JSON.stringify(await buildBackup()))
    expect(validateBackup(json).ok).toBe(true)

    await clearAll()
    const imported = await applyBackup(json, 'replace')
    expect(imported.transactions).toBe(3)
    expect(imported.goals).toBe(1)
    expect(imported.trips).toBe(1)

    expect(await db.accounts.toArray()).toEqual(before.accounts)
    expect(await db.categories.toArray()).toEqual(before.categories)
    expect(await db.transactions.toArray()).toEqual(before.transactions)
    expect(await db.scheduled.toArray()).toEqual(before.scheduled)
    expect(await db.settings.toArray()).toEqual(before.settings)
    expect(await db.goals.toArray()).toEqual(before.goals)
    expect(await db.trips.toArray()).toEqual(before.trips)
  })

  it('imports an older backup with no goals/trips arrays', async () => {
    await seedFixture()
    const json = JSON.parse(JSON.stringify(await buildBackup()))
    delete json.data.goals // simulate a pre-v3 export
    delete json.data.trips // simulate a pre-v4 export
    expect(validateBackup(json).ok).toBe(true)

    await clearAll()
    const imported = await applyBackup(json, 'replace')
    expect(imported.goals).toBe(0)
    expect(imported.trips).toBe(0)
    expect(await db.goals.count()).toBe(0)
    expect(await db.trips.count()).toBe(0)
    expect(await db.transactions.count()).toBe(3)
  })

  it('replaces existing cloud data with the original v1 export shape from before Supabase', async () => {
    // This matches the JSON structure emitted by the original local-only app:
    // it has the five base arrays, with no later goals/trips arrays.
    const julyExport = {
      format: 'budget-app-backup',
      version: 1,
      exportedAt: '2026-07-19T12:00:00.000Z',
      data: {
        accounts: [{ id: 7, name: 'Checking', type: 'asset', startingBalance: 100 }],
        categories: [{ id: 3, name: 'Food', kind: 'expense' }],
        transactions: [{ id: 11, type: 'expense', amount: 12.5, date: 1784462400000, categoryId: 3, accountId: 7 }],
        scheduled: [],
        settings: [{ key: 'inflationRate', value: 2 }],
      },
    }
    const saved = {
      row: {
        user_id: 'user-1',
        data: { format: 'budget-app-backup', version: 1, data: { accounts: [{ id: 1, name: 'Old cloud account' }] } },
        updated_at: 'old-revision',
      },
      revision: 0,
    }
    const cloudClient = {
      from: () => ({
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: saved.row, error: null }) }),
        }),
      }),
      rpc: vi.fn(async (_name, { p_data, p_expected_updated_at }) => {
        if ((saved.row && saved.row.updated_at !== p_expected_updated_at) || (!saved.row && p_expected_updated_at !== null)) {
          return { data: null, error: new Error('Budget changed on another device.') }
        }
        const updated_at = `revision-${++saved.revision}`
        saved.row = { user_id: 'user-1', data: p_data, updated_at }
        return { data: updated_at, error: null }
      }),
    }
    const cloudDb = new CloudDatabase(cloudClient)
    await cloudDb.initialize('user-1')

    expect(validateBackup(julyExport)).toMatchObject({ ok: true, counts: { accounts: 1, categories: 1, transactions: 1, scheduled: 0, settings: 1, goals: 0, trips: 0 } })
    const imported = await applyBackup(julyExport, 'replace', cloudDb)

    expect(imported).toMatchObject({ accounts: 1, categories: 1, transactions: 1, scheduled: 0, settings: 1, goals: 0, trips: 0 })
    expect(saved.row.data.data.accounts).toEqual(julyExport.data.accounts)
    expect(saved.row.data.data.accounts.some((account) => account.name === 'Old cloud account')).toBe(false)
    expect(saved.row.data.data.transactions).toEqual(julyExport.data.transactions)
    expect(saved.row.data.data.settings).toEqual(julyExport.data.settings)
    expect(cloudClient.rpc).toHaveBeenCalledTimes(1)
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
    expect(imported.transactions).toBe(3)
    expect(imported.trips).toBe(1)

    const accounts = await db.accounts.toArray()
    expect(accounts).toHaveLength(2)
    // The existing account was NOT overwritten.
    expect(accounts.find((a) => a.id === myChecking).startingBalance).toBe(42)

    // Transaction references point at the local ids now.
    const txs = await db.transactions.toArray()
    const expense = txs.find((t) => t.description === 'Lunch')
    expect(expense.accountId).toBe(myChecking)
    const transfer = txs.find((t) => t.type === 'transfer')
    expect(transfer.fromAccountId).toBe(myChecking)
    const savingsId = accounts.find((a) => a.name === 'Savings').id
    expect(transfer.toAccountId).toBe(savingsId)

    // The trip was created fresh and the tagged transaction remapped to it.
    const trips = await db.trips.toArray()
    expect(trips).toHaveLength(1)
    const ramen = txs.find((t) => t.description === 'Ramen')
    expect(ramen.tripId).toBe(trips[0].id)

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
