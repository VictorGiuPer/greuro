import { deepStrictEqual, strictEqual } from 'node:assert/strict'
import { registerBudgetTools } from './budgetTools.ts'

Deno.test('Deno loads shared app calculations and executes revision-aware pooled goal funding', async () => {
  const tools = new Map<string, any>()
  let revision = 'r1'
  let records: any = { accounts: [{ id: 1, name: 'Bank', type: 'asset', startingBalance: 1000 }, { id: 2, name: 'Cash', type: 'asset', startingBalance: 200 }], categories: [{ id: 1, kind: 'expense' }], goals: [{ id: 1, name: 'Holiday', targetAmount: 1000, earmarked: 1000, modelVersion: 2 }], trips: [{ id: 1, name: 'Holiday', days: 2, goalId: 1 }], transactions: [], scheduled: [], settings: [] }
  const client = {
    from: () => ({ select: () => ({ maybeSingle: () => Promise.resolve({ data: { data: { format: 'budget-app-backup', version: 1, data: records }, updated_at: revision }, error: null }) }) }),
    rpc: (_name: string, input: any) => {
      strictEqual(input.p_expected_updated_at, revision)
      records = input.p_data.data; revision = 'r2'
      return Promise.resolve({ data: revision, error: null })
    },
  }
  registerBudgetTools({ registerTool: (name: string, config: any, callback: any) => tools.set(name, { config, callback }) } as never, client as never)
  const call = async (name: string, input: any) => {
    const tool = tools.get(name)
    const response = await tool.callback(tool.config.inputSchema.parse(input))
    return { ...response, value: JSON.parse(response.content[0].text) }
  }
  const saved = await call('add_transactions', { transactions: [{ type: 'expense', amount: 40, accountId: 2, categoryId: 1, tripId: 1, date: Date.UTC(2026, 10, 8), description: 'Cash lunch' }], expectedUpdatedAt: 'r1' })
  strictEqual(saved.isError, undefined)
  strictEqual(records.goals[0].earmarked, 960)
  strictEqual(records.transactions.length, 1)
  const read = await call('get_financial_data', { asOf: Date.UTC(2026, 10, 9) })
  deepStrictEqual({ spent: read.value.goals[0].spent, earmarked: read.value.goals[0].earmarked, remaining: read.value.goals[0].remaining }, { spent: 40, earmarked: 960, remaining: 0 })
  const stale = await call('release_goal', { id: 1, amount: 25, expectedUpdatedAt: 'r1' })
  strictEqual(stale.isError, true)
  strictEqual(records.goals[0].earmarked, 960)
})
