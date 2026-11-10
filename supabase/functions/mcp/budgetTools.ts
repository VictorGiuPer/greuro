import { z } from 'npm:zod@^4.3.6'
import type { McpServer } from 'npm:@modelcontextprotocol/server@^2.0.0'
import type { SupabaseClient } from 'npm:@supabase/supabase-js@^2'
import { applyBudgetAction, budgetTables } from '../../../src/lib/budgetDomain.js'
import { budgetAnalytics } from '../../../src/lib/budgetAnalytics.js'

const id = z.number().int().positive()
const fields = z.record(z.string(), z.unknown())
const releases = z.array(z.object({ goalId: id, amount: z.number().positive() })).optional()
const revision = { expectedUpdatedAt: z.string().describe('Revision returned by get_budget_data or preview_budget_action. Stale revisions are rejected.') }
const edits = { id, fields, releases, ...revision }
const actions = ['transaction.add', 'transaction.update', 'transaction.delete', 'transaction.batch', 'goal.add', 'goal.update', 'goal.delete', 'goal.reserve', 'goal.release', 'goal.review', 'goal.finish', 'goal.reopen', 'trip.add', 'trip.update', 'trip.delete', 'trip.assign', 'account.add', 'account.update', 'account.delete', 'account.balance', 'category.add', 'category.update', 'category.delete', 'scheduled.add', 'scheduled.update', 'scheduled.delete', 'scheduled.post', 'settings.set', 'pool.resolve'] as const
const json = (value: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(value) }] })

export async function loadBudget(client: SupabaseClient) {
  const { data, error } = await client.from('budget_backups').select('data, updated_at').maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new Error('This account does not have a Greuro budget yet.')
  const records = Object.fromEntries(budgetTables.map((table: string) => [table, data.data.data[table] || []]))
  return { records, budget: data.data, updatedAt: data.updated_at }
}

export function registerBudgetTools(server: McpServer, client: SupabaseClient) {
  const read = (name: string, description: string, schema: any, handler: (input: any, loaded: any) => unknown) => server.registerTool(name, { description, inputSchema: schema, annotations: { readOnlyHint: true } }, async (input: any) => json(await handler(input, await loadBudget(client))))
  const write = (name: string, action: string, description: string, schema: any, transform: (input: any) => any = (input) => input) => server.registerTool(name, {
    description, inputSchema: schema, annotations: { readOnlyHint: false, destructiveHint: !action.endsWith('.add') },
  }, async (input: any) => {
    try {
      const loaded = await loadBudget(client)
      if (input.expectedUpdatedAt !== loaded.updatedAt) throw new Error('Budget changed. Read or preview again before saving.')
      const applied = applyBudgetAction(loaded.records, action, transform(input), { allowShortfall: action === 'scheduled.post' })
      const backup = { ...loaded.budget, exportedAt: new Date().toISOString(), data: applied.data }
      const { data: savedAt, error } = await client.rpc('save_budget_backup', { p_data: backup, p_expected_updated_at: loaded.updatedAt })
      if (error || !savedAt) throw new Error(error?.message || 'Supabase did not confirm the save.')
      return json({ result: applied.result, pool: applied.pool, updatedAt: savedAt })
    } catch (error: any) {
      return { ...json({ error: error.message, code: error.code || 'ACTION_FAILED', details: error.details || {} }), isError: true }
    }
  })

  read('get_financial_data', 'Read every app financial record and calculated value: balances, pool, cash flow, reports, owed groups, trips, goals, allocation, calculator, schedules, settings, and investment forecast. Defaults to current month in Europe/Brussels. No truncation.', z.object({ asOf: z.number().optional(), timeZone: z.string().optional(), from: z.number().optional(), to: z.number().optional(), target: z.number().nonnegative().optional(), averageMonths: z.number().int().min(1).max(12).optional() }).strict(), (input, loaded) => ({ updatedAt: loaded.updatedAt, ...budgetAnalytics(loaded.records, input) }))
  read('preview_budget_action', 'Preview any management action without saving. Returns exact record changes, result, pooled balance and revision. Supply the revision to its management tool. goal finish previews list every linked trip and released money.', z.object({ action: z.enum(actions), input: fields }).strict(), (input, loaded) => {
    const applied = applyBudgetAction(loaded.records, input.action, input.input, { allowShortfall: input.action === 'scheduled.post' })
    return { updatedAt: loaded.updatedAt, result: applied.result, pool: applied.pool, changes: Object.fromEntries(budgetTables.filter((table: string) => JSON.stringify(loaded.records[table]) !== JSON.stringify(applied.data[table])).map((table: string) => [table, applied.data[table]])) }
  })
  read('preview_trip_goal', 'List existing trip purchases for explicit assignment. Selecting them counts historical spending without consuming present reservations. Existing goal links are included for reassignment review.', z.object({ id, goalId: id.nullable() }).strict(), (input, loaded) => {
    const trip = loaded.records.trips.find((t: any) => t.id === input.id)
    if (!trip) throw new Error('Trip does not exist.')
    return { updatedAt: loaded.updatedAt, trip, goalId: input.goalId, purchases: loaded.records.transactions.filter((t: any) => t.tripId === input.id && t.type === 'expense') }
  })
  for (const [name, table] of [['list_accounts', 'accounts'], ['list_categories', 'categories'], ['list_goals', 'goals'], ['list_trips', 'trips'], ['list_scheduled', 'scheduled'], ['get_settings', 'settings']]) read(name, `Read all ${table}, including all stored fields and archived records.`, z.object({}).strict(), (_input, loaded) => loaded.records[table])
  read('get_transactions', 'Read matching complete transaction records including goal funding, refund links, trip tags and reimbursement fields. Newest first; account matches either transfer endpoint.', z.object({ dateFrom: z.number().optional(), dateTo: z.number().optional(), accountId: id.optional(), categoryId: id.optional(), tripId: id.optional(), goalId: id.optional(), type: z.enum(['income', 'expense', 'transfer']).optional(), limit: z.number().int().positive().optional() }).strict(), (input, loaded) => loaded.records.transactions.filter((t: any) => (input.dateFrom == null || t.date >= input.dateFrom) && (input.dateTo == null || t.date <= input.dateTo) && (input.accountId == null || [t.accountId, t.fromAccountId, t.toAccountId].includes(input.accountId)) && ['categoryId', 'tripId', 'goalId', 'type'].every((key) => input[key] == null || t[key] === input[key])).sort((a: any, b: any) => b.date - a.date || b.id - a.id).slice(0, input.limit))

  write('add_transactions', 'transaction.batch', 'Add complete transactions atomically. Expense goalId null means no goal; omitted uses the trip default. Goal spending consumes exact reservations. Income refundOfTransactionId references a purchase. releases are explicit goal/amount pairs. Returns records and new revision.', z.object({ transactions: z.array(fields).min(1), releases, ...revision }).strict(), (input) => input)
  // The helper takes action before description; keep old transaction tool names.
  write('update_transaction', 'transaction.update', 'Edit a transaction and reconcile goal funding/refunds atomically. Supply only editable fields, plus explicit releases if required.', z.object(edits).strict())
  write('delete_transaction', 'transaction.delete', 'Delete a transaction and reverse only its actual goal funding. Purchases with refunds must have refunds removed first.', z.object({ id, releases, ...revision }).strict())
  for (const entity of ['account', 'category', 'goal', 'trip', 'scheduled']) {
    write(`add_${entity}`, `${entity}.add`, `Create ${entity}. Provide its ordinary app fields. Financial counters, IDs and timestamps are assigned by the service.`, z.object({ fields, ...revision }).strict())
    write(`update_${entity}`, `${entity}.update`, `Edit ${entity}. Trip archival requires confirm and finishes its linked group. Goal reservations use dedicated tools.`, z.object({ ...edits, confirm: z.boolean().optional() }).strict())
    write(`delete_${entity}`, `${entity}.delete`, `Delete ${entity} with app referential-integrity guards. Funded goal deletion requires confirm; goals with spending history must be finished instead.`, z.object({ id, confirm: z.boolean().optional(), releases, ...revision }).strict())
  }
  for (const [name, action] of [['reserve_goal', 'goal.reserve'], ['release_goal', 'goal.release'], ['review_legacy_goal', 'goal.review']]) write(name, action, 'Explicitly reserve/release money or confirm a legacy goal amount. Uses the shared non-investment pool; legacy review is allowed once.', z.object({ id, amount: z.number().nonnegative(), ...revision }).strict())
  for (const [name, action] of [['finish_goal', 'goal.finish'], ['reopen_goal', 'goal.reopen']]) write(name, action, 'Confirm finishing/reopening a goal and all its linked trips. Finishing releases remaining money. Reopening does not re-reserve it.', z.object({ id, confirm: z.literal(true), ...revision }).strict())
  write('assign_trip_goal', 'trip.assign', 'Connect a trip and explicitly selected historical purchases to a goal. Historical imports consume no current reserve. Confirm reassignment when overriding existing purchase goals.', z.object({ id, goalId: id.nullable(), transactionIds: z.array(id), confirm: z.literal(true), confirmReassign: z.boolean().optional(), releases, ...revision }).strict())
  write('set_account_balance', 'account.balance', 'Correct a balance with a statistics-excluded adjustment transaction, preserving the ledger. Explicit releases may be required.', z.object({ id, balance: z.number(), releases, ...revision }).strict())
  write('set_settings', 'settings.set', 'Update app preferences without overwriting unrelated settings.', z.object({ values: fields, ...revision }).strict())
  write('post_scheduled', 'scheduled.post', 'Post due occurrences atomically and advance schedules once. May leave an explicit shortfall requiring release resolution, matching app auto-post behaviour.', z.object({ asOf: z.number().optional(), ...revision }).strict())
  write('resolve_savings_shortfall', 'pool.resolve', 'Resolve uncovered reservations with explicit release pairs. Rejects insufficient releases.', z.object({ releases: z.array(z.object({ goalId: id, amount: z.number().positive() })), ...revision }).strict())
}
