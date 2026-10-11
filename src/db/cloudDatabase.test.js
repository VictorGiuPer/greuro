import { describe, expect, it, vi } from 'vitest'
import { CloudDatabase } from './cloudDatabase'

function fakeSupabase(initial = null) {
  const state = { saved: initial, revision: 0 }
  return {
    state,
    from: () => ({
      select: () => ({
        eq: (_key, userId) => ({
          maybeSingle: async () => ({ data: state.saved?.user_id === userId ? state.saved : null, error: null }),
        }),
      }),
    }),
    rpc: vi.fn(async (_name, { p_data, p_expected_updated_at }) => {
      if (state.saved && state.saved.updated_at !== p_expected_updated_at) {
        return { data: null, error: new Error('Budget changed on another device.') }
      }
      if (!state.saved && p_expected_updated_at !== null) {
        return { data: null, error: new Error('Budget changed on another device.') }
      }
      const updated_at = `revision-${++state.revision}`
      state.saved = { user_id: 'user-1', data: p_data, updated_at }
      return { data: updated_at, error: null }
    }),
  }
}

describe('cloud database', () => {
  it('loads the signed-in account and persists changes to Supabase', async () => {
    const client = fakeSupabase()
    const db = new CloudDatabase(client)
    await db.initialize('user-1')
    const accountId = await db.accounts.add({ name: 'Checking', startingBalance: 125 })

    expect(accountId).toBe(1)
    expect(await db.accounts.toArray()).toEqual([{ id: 1, name: 'Checking', startingBalance: 125 }])
    expect(client.state.saved.data.data.accounts).toEqual([{ id: 1, name: 'Checking', startingBalance: 125 }])
    expect(client.rpc).toHaveBeenCalledTimes(1)
  })

  it('loads backup rows and preserves their IDs', async () => {
    const client = fakeSupabase({
      user_id: 'user-1',
      updated_at: 'revision-0',
      data: { format: 'budget-app-backup', version: 1, data: { accounts: [{ id: 42, name: 'Savings' }] } },
    })
    const db = new CloudDatabase(client)
    const { isNew } = await db.initialize('user-1')

    expect(isNew).toBe(false)
    expect(await db.accounts.get(42)).toEqual({ id: 42, name: 'Savings' })
    expect(await db.accounts.add({ name: 'Checking' })).toBe(43)
  })

  it('does not keep an unsaved local mutation when Supabase rejects it', async () => {
    const client = fakeSupabase()
    const db = new CloudDatabase(client)
    await db.initialize('user-1')
    client.rpc.mockResolvedValueOnce({ data: null, error: new Error('Network unavailable.') })

    await expect(db.accounts.add({ name: 'Checking' })).rejects.toThrow('Network unavailable.')
    expect(await db.accounts.toArray()).toEqual([])
  })

  it('does not report success when Supabase returns no save confirmation', async () => {
    const client = fakeSupabase()
    const db = new CloudDatabase(client)
    await db.initialize('user-1')
    client.rpc.mockResolvedValueOnce({ data: null, error: null })

    await expect(db.accounts.add({ name: 'Checking' })).rejects.toThrow(
      'Supabase did not confirm that the budget was saved.',
    )
    expect(await db.accounts.toArray()).toEqual([])
  })
})
