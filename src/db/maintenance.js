import { db } from './db'

/** Erase EVERYTHING (all five tables). Only called behind a typed confirm. */
export async function wipeAllData() {
  await db.transaction('rw', db.tables, async () => {
    await Promise.all(db.tables.map((t) => t.clear()))
  })
}

/** True when the app has no user data at all (drives onboarding). */
export async function isDatabaseEmpty() {
  const [accounts, transactions] = await Promise.all([
    db.accounts.count(),
    db.transactions.count(),
  ])
  return accounts === 0 && transactions === 0
}
