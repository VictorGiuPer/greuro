import { z } from 'npm:zod@^4.3.6'
import type { McpServer } from 'npm:@modelcontextprotocol/server@^2.0.0'
import type { SupabaseClient } from 'npm:@supabase/supabase-js@^2'

const id = z.number().int().positive().max(Number.MAX_SAFE_INTEGER)
const timestamp = z.number().int().min(0).max(8640000000000000)
const flag = z.union([z.boolean(), z.literal(0), z.literal(1)])
const fields = z.object({
  date: timestamp.describe('Unix timestamp in milliseconds, as stored by Greuro.'),
  type: z.enum(['income', 'expense', 'transfer']),
  amount: z.number().positive(),
  description: z.string(),
  accountId: id.nullable().optional(),
  categoryId: id.nullable().optional(),
  fromAccountId: id.nullable().optional(),
  toAccountId: id.nullable().optional(),
  tripId: id.nullable().optional(),
  reimbursable: flag.optional(),
  owedAmount: z.number().nonnegative().optional(),
  paidBackNote: z.string().nullable().optional(),
  resolved: flag.optional(),
  isAdjustment: flag.optional(),
}).strict()

// Kept separate from the HTTP entry point so registration and RPC wiring can be tested.
export function registerTransactionTools(server: McpServer, supabase: SupabaseClient) {
  const register = (name: string, description: string, inputSchema: z.ZodObject,
    readOnly: boolean, action: string) => {
    server.registerTool(name, {
      description,
      inputSchema,
      annotations: { readOnlyHint: readOnly, ...(!readOnly && { destructiveHint: action !== 'add' }) },
    }, async (input) => {
      const { data, error } = await supabase.rpc('greuro_transactions', {
        p_action: action,
        p_input: input,
      })
      if (error) throw new Error(`Could not ${name}: ${error.message}`)
      return { content: [{ type: 'text', text: JSON.stringify(data) }] }
    })
  }

  register('add_transactions',
    'Add a batch atomically. IDs and millisecond timestamps are server-assigned. Income/expense require an existing account and matching category; transfers require two different existing accounts. Returns the created records.',
    z.object({ transactions: z.array(fields).min(1) }).strict(), false, 'add')
  register('update_transaction',
    'Update only the supplied fields of one transaction. The merged record is validated. ID and createdAt cannot be changed; updatedAt is server-assigned. Returns the updated record.',
    z.object({ id, fields: fields.partial().refine((patch) => Object.keys(patch).length > 0, 'Supply at least one field') }).strict(), false, 'update')
  register('delete_transaction', 'Delete one transaction by ID. Returns its ID; a missing ID is an error.',
    z.object({ id }).strict(), false, 'delete')
  register('get_transactions',
    'Read matching transactions, newest date then highest ID first. Date bounds are inclusive Unix milliseconds. accountId matches either side of transfers. Omit limit to return all matching records.',
    z.object({
      dateFrom: timestamp.optional(), dateTo: timestamp.optional(),
      accountId: id.optional(), categoryId: id.optional(),
      type: z.enum(['income', 'expense', 'transfer']).optional(),
      limit: z.number().int().positive().max(2147483647).optional(),
    }).strict().refine((f) => f.dateFrom == null || f.dateTo == null || f.dateFrom <= f.dateTo, 'dateFrom must not exceed dateTo'),
    true, 'get')
  register('list_accounts', 'Read the signed-in user’s account records without the budget snapshot.',
    z.object({}).strict(), true, 'accounts')
  register('list_categories', 'Read the signed-in user’s category records, including their income/expense kind.',
    z.object({}).strict(), true, 'categories')
}
