import { deepStrictEqual, rejects, throws } from 'node:assert/strict'
import { registerTransactionTools } from './transactionTools.ts'
import type { z } from 'npm:zod@^4.3.6'

type Tool = {
  config: { inputSchema: z.ZodType; annotations: { readOnlyHint: boolean } }
  callback: (input: unknown) => Promise<unknown>
}

function setup(response: { data: unknown; error: { message: string } | null } = { data: [], error: null }) {
  const tools = new Map<string, Tool>()
  const calls: unknown[] = []
  registerTransactionTools({ registerTool: (name: string, config: Tool['config'], callback: Tool['callback']) => tools.set(name, { config, callback }) } as never,
    { rpc: (name: string, input: unknown) => { calls.push({ name, input }); return Promise.resolve(response) } } as never)
  return { tools, calls }
}

Deno.test('granular tools route only supplied input to the RPC', async () => {
  const { tools, calls } = setup()
  const inputs = {
    add_transactions: { transactions: [{ date: 1000, type: 'expense', amount: 4, description: 'Lunch', accountId: 1, categoryId: 2 }] },
    update_transaction: { id: 1, fields: { description: 'Edited' } },
    delete_transaction: { id: 1 },
    get_transactions: { accountId: 1, dateFrom: 0, limit: 5 },
    list_accounts: {}, list_categories: {},
  }
  const actions = ['add', 'update', 'delete', 'get', 'accounts', 'categories']
  for (const [index, [name, input]] of Object.entries(inputs).entries()) {
    const tool = tools.get(name)!
    deepStrictEqual(tool.config.inputSchema.parse(input), input)
    deepStrictEqual(await tool.callback(input), { content: [{ type: 'text', text: '[]' }] })
    deepStrictEqual(calls[index], { name: 'greuro_transactions', input: { p_action: actions[index], p_input: input } })
    deepStrictEqual(tool.config.annotations.readOnlyHint, index >= 3)
  }
})

Deno.test('schemas reject malformed patches, managed fields and invalid filters', () => {
  const { tools } = setup()
  for (const input of [{ id: 1, fields: {} }, { id: 1, fields: { id: 2 } },
    { id: 1, fields: { createdAt: 0 } }, { id: 1, fields: { amount: -1 } }]) {
    throws(() => tools.get('update_transaction')!.config.inputSchema.parse(input))
  }
  for (const input of [{ dateFrom: 5, dateTo: 1 }, { limit: 0 }, { type: 'other' }, { accountId: 1.5 }]) {
    throws(() => tools.get('get_transactions')!.config.inputSchema.parse(input))
  }
  throws(() => tools.get('add_transactions')!.config.inputSchema.parse({ transactions: [] }))
})

Deno.test('database errors are surfaced instead of reporting successful writes', async () => {
  const { tools } = setup({ data: null, error: { message: 'Invalid account' } })
  await rejects(tools.get('delete_transaction')!.callback({ id: 1 }), /Invalid account/)
})
