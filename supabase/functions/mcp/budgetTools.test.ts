import { describe, expect, it, vi } from 'vitest'
import { registerBudgetTools } from './budgetTools'
import { budgetAnalytics } from '../../../src/lib/budgetAnalytics'

function fixture() {
  const tools = new Map<string, any>()
  const state: any = { revision: 'r1', data: { accounts: [{ id: 1, name: 'Bank', type: 'asset', startingBalance: 2000 }, { id: 2, name: 'Cash', type: 'asset', startingBalance: 200 }], categories: [{ id: 1, name: 'Travel', kind: 'expense' }, { id: 2, name: 'Refund', kind: 'income' }], transactions: [], goals: [{ id: 1, name: 'Japan', targetAmount: 1000, modelVersion: 2, earmarked: 1000 }], trips: [{ id: 1, name: 'Japan', days: 5, goalId: 1 }], settings: [], scheduled: [] } }
  const client: any = {
    from: () => ({ select: () => ({ maybeSingle: async () => ({ data: { data: { format: 'budget-app-backup', version: 1, data: structuredClone(state.data) }, updated_at: state.revision }, error: null }) }) }),
    rpc: vi.fn(async (_name: string, input: any) => {
      if (input.p_expected_updated_at !== state.revision) return { data: null, error: new Error('Stale revision') }
      state.data = structuredClone(input.p_data.data); state.revision += 'x'
      return { data: state.revision, error: null }
    }),
  }
  registerBudgetTools({ registerTool: (name: string, config: any, callback: any) => tools.set(name, { config, callback }) } as any, client)
  const call = async (name: string, input: any = {}) => {
    const tool = tools.get(name); const parsed = tool.config.inputSchema.parse(input)
    const result = await tool.callback(parsed)
    return { ...result, value: JSON.parse(result.content[0].text) }
  }
  return { state, tools, client, call }
}

describe('complete MCP budget tools', () => {
  it('registers reads and management for every financial app subsystem', () => {
    const { tools } = fixture()
    for (const entity of ['account', 'category', 'goal', 'trip', 'scheduled']) for (const verb of ['add', 'update', 'delete']) expect(tools.has(`${verb}_${entity}`)).toBe(true)
    for (const name of ['get_financial_data', 'get_transactions', 'list_accounts', 'list_categories', 'list_goals', 'list_trips', 'list_scheduled', 'get_settings', 'preview_budget_action', 'preview_trip_goal', 'add_transactions', 'update_transaction', 'delete_transaction', 'reserve_goal', 'release_goal', 'review_legacy_goal', 'finish_goal', 'reopen_goal', 'assign_trip_goal', 'set_account_balance', 'set_settings', 'post_scheduled', 'resolve_savings_shortfall']) expect(tools.has(name)).toBe(true)
  })
  it('returns app-identical analytics, full raw fields, archived data and a revision', async () => {
    const { state, call } = fixture()
    const asOf = Date.UTC(2026, 10, 8)
    const response = await call('get_financial_data', { asOf })
    expect(response.value).toEqual({ updatedAt: 'r1', ...budgetAnalytics(state.data, { asOf }) })
  })
  it('uses the chosen completed-month average for reads and the savings calculator', async () => {
    const { state, call } = fixture()
    state.data.transactions.push({ id: 1, type: 'income', amount: 1200, date: Date.UTC(2026, 9, 10), accountId: 1, categoryId: 2 })
    const options = { asOf: Date.UTC(2026, 10, 10), target: 1200 }
    const three = await call('get_financial_data', options)
    const twelve = await call('get_financial_data', { ...options, averageMonths: 12 })
    expect(three.value.allocation).toHaveLength(4)
    expect(three.value.average).toMatchObject({ months: 3, savings: 400 })
    expect(three.value.calculator.months).toBe(3)
    expect(twelve.value.average).toMatchObject({ months: 12, savings: 100 })
    expect(twelve.value.calculator.months).toBe(12)
    await expect(call('get_financial_data', { averageMonths: 13 })).rejects.toThrow()
    expect(state.data.settings).toEqual([])
  })
  it('uses real schemas to require revision and explicit releases', async () => {
    const { call, client } = fixture()
    await expect(call('reserve_goal', { id: 1, amount: 100 })).rejects.toThrow()
    await expect(call('release_goal', { id: 1, amount: -5, expectedUpdatedAt: 'r1' })).rejects.toThrow()
    expect(client.rpc).not.toHaveBeenCalled()
  })
  it('previews without writing and rejects stale confirmations', async () => {
    const { call, state, client } = fixture()
    const preview = await call('preview_budget_action', { action: 'goal.reserve', input: { id: 1, amount: 100 } })
    expect(preview.value.pool.earmarked).toBe(1100)
    expect(state.data.goals[0].earmarked).toBe(1000); expect(client.rpc).not.toHaveBeenCalled()
    state.revision = 'r2'
    const response = await call('reserve_goal', { id: 1, amount: 100, expectedUpdatedAt: preview.value.updatedAt })
    expect(response.isError).toBe(true); expect(client.rpc).not.toHaveBeenCalled()
  })
  it('supports mixed-account funding, explicit None, atomic batches and structured conflicts', async () => {
    const { call, state, client } = fixture()
    const tx = (amount: number, accountId: number) => ({ type: 'expense', amount, accountId, categoryId: 1, tripId: 1, date: 1000, description: 'Purchase' })
    const saved = await call('add_transactions', { transactions: [tx(300, 1), tx(40, 2)], expectedUpdatedAt: 'r1' })
    expect(saved.isError).toBeUndefined(); expect(state.data.goals[0].earmarked).toBe(660)
    expect(client.rpc).toHaveBeenCalledTimes(1)
    const conflict = await call('add_transactions', { transactions: [{ ...tx(1300, 1), goalId: null }], expectedUpdatedAt: state.revision })
    expect(conflict.isError).toBe(true); expect(conflict.value.code).toBe('RELEASE_REQUIRED')
    expect(state.data.transactions).toHaveLength(2)
  })
  it('manages the full goal lifecycle and exposes historical-assignment previews', async () => {
    const { call, state } = fixture()
    const preview = await call('preview_trip_goal', { id: 1, goalId: 1 })
    expect(preview.value.trip.goalId).toBe(1)
    const finished = await call('finish_goal', { id: 1, confirm: true, expectedUpdatedAt: 'r1' })
    expect(finished.value.result.released).toBe(1000); expect(state.data.trips[0].archived).toBe(1)
    await call('reopen_goal', { id: 1, confirm: true, expectedUpdatedAt: state.revision })
    expect(state.data.goals[0].earmarked).toBe(0); expect(state.data.trips[0].archived).toBe(0)
  })
  it('does not confirm or keep local changes when Supabase rejects a save', async () => {
    const { call, client, state } = fixture()
    client.rpc.mockResolvedValueOnce({ data: null, error: new Error('Network failed') })
    const result = await call('release_goal', { id: 1, amount: 25, expectedUpdatedAt: 'r1' })
    expect(result.isError).toBe(true); expect(state.data.goals[0].earmarked).toBe(1000)
  })
  it.each([
    ['account', { name: 'New bank', type: 'asset', startingBalance: 100 }, { name: 'Renamed bank' }],
    ['category', { name: 'Food', kind: 'expense', icon: 'Circle', color: '#fff' }, { name: 'Meals' }],
    ['goal', { name: 'Camera', targetAmount: 500 }, { targetAmount: 600 }],
    ['trip', { name: 'Weekend', days: 2 }, { days: 3 }],
    ['scheduled', { type: 'expense', amount: 25, accountId: 1, categoryId: 1, description: 'Subscription', nextDueDate: 1000, recurrence: { unit: 'month', interval: 1 } }, { amount: 30 }],
  ])('creates, edits and deletes %s records without altering unrelated data', async (entity, fields, patch) => {
    const { call, state } = fixture()
    const created = await call(`add_${entity}`, { fields, expectedUpdatedAt: state.revision })
    expect(created.isError).toBeUndefined()
    const id = created.value.result.id
    const updated = await call(`update_${entity}`, { id, fields: patch, expectedUpdatedAt: state.revision })
    expect(updated.value.result).toMatchObject(patch)
    const deleted = await call(`delete_${entity}`, { id, expectedUpdatedAt: state.revision })
    expect(deleted.value.result).toEqual({ deleted: true, id })
    expect(state.data.goals[0].earmarked).toBe(1000)
  })
  it('updates preferences, corrects balances with releases, and posts schedules once', async () => {
    const { call, state } = fixture()
    await call('set_settings', { values: { monthlyInvestment: 100, mainAccountId: 2 }, expectedUpdatedAt: state.revision })
    expect(state.data.settings).toContainEqual({ key: 'monthlyInvestment', value: 100 })
    const adjusted = await call('set_account_balance', { id: 1, balance: 100, releases: [{ goalId: 1, amount: 700 }], expectedUpdatedAt: state.revision })
    expect(adjusted.isError).toBeUndefined(); expect(state.data.transactions[0].isAdjustment).toBe(1)
    await call('add_scheduled', { fields: { type: 'expense', amount: 50, accountId: 1, categoryId: 1, description: 'Bill', nextDueDate: Date.UTC(2026, 10, 1), recurrence: { unit: 'month', interval: 1 } }, expectedUpdatedAt: state.revision })
    const posted = await call('post_scheduled', { asOf: Date.UTC(2026, 10, 2), expectedUpdatedAt: state.revision })
    expect(posted.isError).toBeUndefined(); expect(posted.value.result).toHaveLength(1)
    expect(posted.value.pool.shortfall).toBe(50)
    const again = await call('post_scheduled', { asOf: Date.UTC(2026, 10, 2), expectedUpdatedAt: state.revision })
    expect(again.value.result).toHaveLength(0)
    await call('resolve_savings_shortfall', { releases: [{ goalId: 1, amount: 50 }], expectedUpdatedAt: state.revision })
    expect(state.data.goals[0].earmarked).toBe(250)
  })
})
