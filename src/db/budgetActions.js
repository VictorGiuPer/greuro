import { db } from './db'
import { applyBudgetAction, budgetTables } from '../lib/budgetDomain'

export async function readBudget() {
  return Object.fromEntries(await Promise.all(budgetTables.map(async (table) => [table, await db[table].toArray()])))
}

export async function budgetAction(action, input = {}, options = {}) {
  return db.transaction('rw', budgetTables.map((table) => db[table]), async () => {
    const before = await readBudget()
    const applied = applyBudgetAction(before, action, input, options)
    for (const table of budgetTables) {
      const rows = applied.data[table]
      if (JSON.stringify(rows) === JSON.stringify(before[table])) continue
      const key = (r) => table === 'settings' ? r.key : r.id
      for (const row of before[table]) if (!rows.some((r) => key(r) === key(row))) await db[table].delete(key(row))
      await db[table].bulkPut(rows)
    }
    return applied.result
  })
}
