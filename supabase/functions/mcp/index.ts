import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

import { createMcpHandler, McpServer } from 'npm:@modelcontextprotocol/server@^2.0.0'
import { pipeline } from 'npm:@supabase/middleware@1'
import { withOAuthProtectedResource, withSupabase } from 'npm:@supabase/server@1'
import { z } from 'npm:zod@^4.3.6'
import { registerTransactionTools } from './transactionTools.ts'

const budgetSnapshotSchema = z.object({
  format: z.literal('budget-app-backup'),
  version: z.literal(1),
  exportedAt: z.string(),
  data: z.object({
    accounts: z.array(z.unknown()),
    categories: z.array(z.unknown()),
    transactions: z.array(z.unknown()),
    scheduled: z.array(z.unknown()),
    settings: z.array(z.unknown()),
    goals: z.array(z.unknown()),
    trips: z.array(z.unknown()),
  }).strict(),
}).strict()

Deno.serve(
  pipeline(
    [withOAuthProtectedResource(), withSupabase({ auth: 'user' })],
    async (req, { supabase }) => {
      const handler = createMcpHandler(() => {
        const server = new McpServer({ name: 'greuro', version: '1.0.0' })

        server.registerTool(
          'get_budget_data',
          {
            title: 'Read my Greuro budget',
            description: "Read the signed-in user's complete Greuro budget snapshot, including their transactions and budget settings. This tool is read-only.",
            inputSchema: z.object({}),
            annotations: { readOnlyHint: true },
          },
          async () => {
            const { data, error } = await supabase
              .from('budget_backups')
              .select('data, updated_at')
              .maybeSingle()

            if (error) throw new Error(`Could not read Greuro budget: ${error.message}`)
            if (!data) {
              return { content: [{ type: 'text', text: 'This account does not have a Greuro budget yet.' }] }
            }

            return {
              content: [{
                type: 'text',
                text: JSON.stringify({ updated_at: data.updated_at, budget: data.data }),
              }],
            }
          },
        )

        server.registerTool(
          'update_budget_data',
          {
            title: 'Update my Greuro budget',
            description: "Restore the signed-in user's Greuro budget snapshot from a complete version-1 backup. Prefer the granular transaction tools for individual changes. Use get_budget_data first and preserve unrelated records. This can change or remove individual budget records, but cannot delete the database or its table.",
            inputSchema: z.object({ budget: budgetSnapshotSchema }),
            annotations: { readOnlyHint: false, destructiveHint: true },
          },
          async ({ budget }) => {
            const { data: current, error: readError } = await supabase
              .from('budget_backups')
              .select('data, updated_at')
              .maybeSingle()

            if (readError) throw new Error(`Could not check the current Greuro budget: ${readError.message}`)

            const tables = Object.values(budget.data)
            const currentTables = Object.values(current?.data?.data ?? {})
            const clearingEntireBudget = tables.every((rows) => rows.length === 0)
              && currentTables.some((rows) => Array.isArray(rows) && rows.length > 0)
            if (clearingEntireBudget) {
              throw new Error('This connection cannot clear the entire Greuro budget. Remove or edit individual records instead.')
            }

            const { data: savedAt, error: saveError } = await supabase.rpc('save_budget_backup', {
              p_data: budget,
              p_expected_updated_at: current?.updated_at ?? null,
            })

            if (saveError) throw new Error(`Could not update the Greuro budget: ${saveError.message}`)

            return {
              content: [{
                type: 'text',
                text: JSON.stringify({ saved: true, updated_at: savedAt }),
              }],
            }
          },
        )

        registerTransactionTools(server, supabase)
        return server
      })

      return handler.fetch(req)
    },
  ),
)
