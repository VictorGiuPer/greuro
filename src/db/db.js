import Dexie from 'dexie'

/**
 * BudgetDB — IndexedDB (via Dexie) data layer.
 *
 * MONEY CONVENTION
 * ----------------
 * `amount` is ALWAYS stored as a positive number. The sign is DERIVED from the
 * transaction `type` at display / balance time — never persisted.
 *
 * BALANCE CONVENTION (documented here for a later milestone — balances are NOT
 * computed yet in Milestone 1):
 *   - expense:  subtracts `amount` from `accountId`
 *   - income:   adds      `amount` to   `accountId`
 *   - transfer: subtracts `amount` from `fromAccountId`
 *               and adds  `amount` to   `toAccountId`
 *
 * SCHEMA (versioned so future migrations stay clean — bump db.version(N) and
 * add an .upgrade() rather than editing an existing version block):
 *
 * accounts:
 *   id, name, type ('asset'|'liability'), startingBalance,
 *   expectedAnnualReturn (default 0, used later for forecast), createdAt
 *
 * categories:
 *   id, name, color (hex), icon (lucide icon name),
 *   kind ('expense'|'income'), createdAt
 *
 * transactions:
 *   id, type ('expense'|'income'|'transfer'), amount (>0),
 *   date (ms timestamp, INDEXED), description,
 *   categoryId (num|null — required for expense/income, null for transfer),
 *   accountId (num|null — the account for expense/income, null for transfer),
 *   fromAccountId (num|null — transfer source only),
 *   toAccountId (num|null — transfer destination only),
 *   createdAt, updatedAt
 */
export const db = new Dexie('BudgetDB')

// Only indexed fields are listed in .stores(); other fields are stored but
// not indexed. `date` and `type` are indexed for fast paged / filtered
// queries. The compound `[date+id]` index gives a stable, tie-safe cursor for
// descending infinite-scroll paging (rows on the same day share a timestamp).
db.version(1).stores({
  accounts: '++id, name, type',
  categories: '++id, name, kind',
  transactions: '++id, date, type, categoryId, accountId, [date+id]',
})

/**
 * v2 (additive — no .upgrade() needed):
 *
 * scheduled (recurring transaction templates / "reminders"):
 *   id, description, type ('expense'|'income'|'transfer'), amount (>0),
 *   categoryId/accountId (expense|income) or fromAccountId/toAccountId
 *   (transfer) — same nulling convention as transactions,
 *   recurrence { unit: 'day'|'week'|'month'|'year', interval >= 1 },
 *   anchorDay (day-of-month captured from startDate; monthly/yearly advances
 *   clamp to it so Jan 31 -> Feb 28 -> Mar 31),
 *   startDate, nextDueDate, lastPostedDate (all ms at local noon),
 *   active (0|1 — indexed, so booleans are stored as ints),
 *   createdAt, updatedAt
 *
 * settings (key-value rows { key, value }; defaults live in settings.js):
 *   forecast return assumptions, inflation, due-soon thresholds,
 *   onboarding flag, last-backup timestamp, dashboard prefs.
 */
db.version(2).stores({
  scheduled: '++id, nextDueDate, active',
  settings: '&key',
})
