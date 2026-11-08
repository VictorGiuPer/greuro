import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CloudDatabase } from './cloudDatabase'
import { getOwedTransactions, getOwedNameSuggestions, resolveOwedTransactions, undoOwedResolution } from './owed'
import { effectiveAmount } from '../lib/txAmount'

const fixture = vi.hoisted(() => ({ database: null }))
vi.mock('./db', () => ({ get db() { return fixture.database } }))
let client, original

beforeEach(async () => {
  original = [
    { id: 1, date: 1, type: 'expense', amount: 100, reimbursable: 1, owedAmount: 20, paidBackNote: 'Nadine', updatedAt: 1, extra: 'preserved' },
    { id: 2, date: 2, type: 'expense', amount: 100, reimbursable: 1, owedAmount: 30, paidBackNote: ' nadine ', updatedAt: 1 },
    { id: 3, date: 3, type: 'expense', amount: 100, reimbursable: 1, owedAmount: 40, paidBackNote: 'Work team', resolved: 1, updatedAt: 1 },
    { id: 4, date: 4, type: 'expense', amount: 100, updatedAt: 1 },
  ]
  client = {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({
      data: { data: { data: { transactions: original } }, updated_at: 'revision-1' }, error: null,
    }) }) }) }),
    rpc: vi.fn(async () => ({ data: 'revision-2', error: null })),
  }
  fixture.database = new CloudDatabase(client)
  await fixture.database.initialize('user-1')
})

describe('owed persistence', () => {
  it('loads all history and suggests distinct names including resolved entries', async () => {
    expect(await getOwedTransactions()).toHaveLength(3)
    expect(await getOwedNameSuggestions('n')).toEqual([])
    expect(await getOwedNameSuggestions('NA')).toEqual(['nadine'])
    expect(await getOwedNameSuggestions('wo')).toEqual(['Work team'])
    expect(client.rpc).not.toHaveBeenCalled()
  })

  it('resolves only eligible IDs in one save and can undo them together', async () => {
    const changes = await resolveOwedTransactions([1, 2, 2, 3, 4, 99])
    expect(changes).toHaveLength(2)
    expect(client.rpc).toHaveBeenCalledTimes(1)
    expect(effectiveAmount(await fixture.database.transactions.get(1))).toBe(80)
    expect(await fixture.database.transactions.get(1)).toMatchObject({ amount: 100, owedAmount: 20, paidBackNote: 'Nadine', extra: 'preserved' })
    expect(await fixture.database.transactions.get(4)).toEqual(original[3])
    await undoOwedResolution(changes)
    expect(client.rpc).toHaveBeenCalledTimes(2)
    expect(effectiveAmount(await fixture.database.transactions.get(1))).toBe(100)
    expect((await fixture.database.transactions.get(2)).resolved).toBe(0)
    expect((await fixture.database.transactions.get(3)).resolved).toBe(1)
  })

  it('rolls back every member when the cloud save fails', async () => {
    client.rpc.mockResolvedValueOnce({ data: null, error: { message: 'Network unavailable' } })
    await expect(resolveOwedTransactions([1, 2])).rejects.toThrow('Network unavailable')
    expect(await fixture.database.transactions.toArray()).toEqual(original)
  })

  it('rolls back a failed undo and permits retry', async () => {
    const changes = await resolveOwedTransactions([1, 2])
    client.rpc.mockResolvedValueOnce({ data: null, error: { message: 'Network unavailable' } })
    await expect(undoOwedResolution(changes)).rejects.toThrow('Network unavailable')
    expect((await fixture.database.transactions.get(1)).resolved).toBe(1)
    await undoOwedResolution(changes)
    expect((await fixture.database.transactions.get(1)).resolved).toBe(0)
  })

  it('refuses the whole undo if any entry was subsequently edited', async () => {
    const changes = await resolveOwedTransactions([1, 2])
    await fixture.database.transactions.update(2, { updatedAt: changes[1].updatedAt + 1, description: 'Changed' })
    await expect(undoOwedResolution(changes)).rejects.toThrow('changed since resolving')
    expect((await fixture.database.transactions.get(1)).resolved).toBe(1)
  })
})
