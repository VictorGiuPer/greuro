import { db } from './db'

/**
 * PLACEHOLDER SEED DATA (Milestone 1).
 *
 * This is demo data so the Transactions list looks populated on first run.
 * It is inserted ONLY when the database is completely empty (guarded below).
 * Replace / clear this before shipping real data.
 */

// Category color + lucide icon names per the design spec.
const SEED_CATEGORIES = [
  { name: 'Housing', color: '#2EE8C6', icon: 'Home', kind: 'expense' },
  { name: 'Food & Dining', color: '#6EE7B7', icon: 'Utensils', kind: 'expense' },
  { name: 'Transportation', color: '#60A5FA', icon: 'Car', kind: 'expense' },
  { name: 'Shopping', color: '#FBBF24', icon: 'ShoppingBag', kind: 'expense' },
  { name: 'Entertainment', color: '#A78BFA', icon: 'Music', kind: 'expense' },
  { name: 'Other', color: '#818CF8', icon: 'Circle', kind: 'expense' },
  { name: 'Income', color: '#4ADE80', icon: 'Briefcase', kind: 'income' },
]

const SEED_ACCOUNTS = [
  { name: 'Checking', type: 'asset', startingBalance: 4200, expectedAnnualReturn: 0 },
  { name: 'Savings', type: 'asset', startingBalance: 15800, expectedAnnualReturn: 3 },
  { name: 'Credit Card', type: 'liability', startingBalance: 640, expectedAnnualReturn: 0 },
]

// Local-time timestamp for a given Y/M/D so seeded rows group under the
// intended date header regardless of timezone.
const at = (y, m, d) => new Date(y, m - 1, d, 12, 0, 0).getTime()

/**
 * Placeholder transactions from the design spec (May 18–20, 2025).
 * `cat` / `acct` / `from` / `to` are resolved to real ids after the base
 * rows are inserted.
 */
const SEED_TRANSACTIONS = [
  // May 20, 2025
  { type: 'expense', amount: 68.42, date: at(2025, 5, 20), description: 'Grocery Market', cat: 'Food & Dining', acct: 'Checking' },
  { type: 'expense', amount: 25.0, date: at(2025, 5, 20), description: 'City Transit', cat: 'Transportation', acct: 'Checking' },
  { type: 'income', amount: 1250.0, date: at(2025, 5, 20), description: 'Design Services', cat: 'Income', acct: 'Checking' },
  { type: 'transfer', amount: 500.0, date: at(2025, 5, 20), description: '', from: 'Checking', to: 'Savings' },
  // May 19, 2025
  { type: 'expense', amount: 14.75, date: at(2025, 5, 19), description: 'Cafe Delight', cat: 'Food & Dining', acct: 'Checking' },
  { type: 'expense', amount: 89.99, date: at(2025, 5, 19), description: 'Online Store', cat: 'Shopping', acct: 'Credit Card' },
  { type: 'expense', amount: 1200.0, date: at(2025, 5, 19), description: 'Rent Payment', cat: 'Housing', acct: 'Checking' },
  // May 18, 2025
  { type: 'expense', amount: 9.99, date: at(2025, 5, 18), description: 'Music Stream', cat: 'Entertainment', acct: 'Credit Card' },
  { type: 'expense', amount: 45.3, date: at(2025, 5, 18), description: 'Fuel Stop', cat: 'Transportation', acct: 'Checking' },
  { type: 'income', amount: 3200.0, date: at(2025, 5, 18), description: 'Paycheck', cat: 'Income', acct: 'Checking' },
]

/**
 * Seed the database with sample data ONLY if it is empty. Invoked explicitly
 * (onboarding "explore with sample data" / Settings), never automatically.
 * @returns {Promise<boolean>} true when the seed was actually inserted
 */
export async function seedIfEmpty() {
  const existing = await db.transactions.count()
  if (existing > 0) return false

  const now = Date.now()
  let seeded = false

  await db.transaction('rw', db.accounts, db.categories, db.transactions, async () => {
    // Double-check inside the transaction to avoid a race on first load.
    if ((await db.transactions.count()) > 0) return

    await db.accounts.bulkAdd(SEED_ACCOUNTS.map((a) => ({ ...a, createdAt: now })))
    await db.categories.bulkAdd(SEED_CATEGORIES.map((c) => ({ ...c, createdAt: now })))

    const accounts = await db.accounts.toArray()
    const categories = await db.categories.toArray()
    const acctId = (name) => accounts.find((a) => a.name === name)?.id ?? null
    const catId = (name) => categories.find((c) => c.name === name)?.id ?? null

    const rows = SEED_TRANSACTIONS.map((t) => ({
      type: t.type,
      amount: t.amount,
      date: t.date,
      description: t.description,
      categoryId: t.type === 'transfer' ? null : catId(t.cat),
      accountId: t.type === 'transfer' ? null : acctId(t.acct),
      fromAccountId: t.type === 'transfer' ? acctId(t.from) : null,
      toAccountId: t.type === 'transfer' ? acctId(t.to) : null,
      createdAt: now,
      updatedAt: now,
    }))

    await db.transactions.bulkAdd(rows)
    seeded = true
  })

  return seeded
}
