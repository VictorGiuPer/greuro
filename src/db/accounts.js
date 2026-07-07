import { db } from './db'

/** Account reads + writes, with a referential-integrity guard on delete. */

export function getAccounts() {
  return db.accounts.orderBy('name').toArray()
}

/**
 * Count transactions that reference an account in ANY position
 * (accountId for expense/income, fromAccountId/toAccountId for transfers).
 */
export function countAccountUsage(id) {
  return db.transactions
    .filter((t) => t.accountId === id || t.fromAccountId === id || t.toAccountId === id)
    .count()
}

export async function addAccount(data) {
  const now = Date.now()
  return db.accounts.add({
    name: (data.name ?? '').trim(),
    type: data.type === 'liability' ? 'liability' : 'asset',
    startingBalance: Number(data.startingBalance) || 0,
    expectedAnnualReturn: Number(data.expectedAnnualReturn) || 0,
    createdAt: now,
    updatedAt: now,
  })
}

export async function updateAccount(id, patch) {
  const clean = { updatedAt: Date.now() }
  if (patch.name != null) clean.name = String(patch.name).trim()
  if (patch.type != null) clean.type = patch.type === 'liability' ? 'liability' : 'asset'
  if (patch.startingBalance != null) clean.startingBalance = Number(patch.startingBalance) || 0
  if (patch.expectedAnnualReturn != null)
    clean.expectedAnnualReturn = Number(patch.expectedAnnualReturn) || 0
  return db.accounts.update(id, clean)
}

/**
 * Delete an account only if no transaction references it. Never orphans data.
 * @returns {{ ok: true } | { ok: false, count: number }}
 */
export async function deleteAccount(id) {
  const count = await countAccountUsage(id)
  if (count > 0) return { ok: false, count }
  await db.accounts.delete(id)
  return { ok: true }
}
