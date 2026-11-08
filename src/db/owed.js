import { db } from './db'
import { isOwedEntry, owedKey, owedName } from '../lib/owed'
import { outstandingAmount } from '../lib/txAmount'

export async function getOwedTransactions() {
  return db.transactions.filter(isOwedEntry).toArray()
}

export async function getOwedNameSuggestions(prefix, limit = 4) {
  const key = owedKey(prefix)
  if (key.length < 2) return []
  const rows = await getOwedTransactions()
  rows.sort((a, b) => b.date - a.date || b.id - a.id)
  const names = new Map()
  for (const row of rows) {
    const nameKey = owedKey(row.paidBackNote)
    if (nameKey.startsWith(key) && !names.has(nameKey)) names.set(nameKey, owedName(row.paidBackNote))
    if (names.size >= limit) break
  }
  return [...names.values()]
}

// One database transaction = one cloud save, with rollback if it fails.
export async function resolveOwedTransactions(ids) {
  return db.transaction('rw', db.transactions, async () => {
    const changes = []
    const updatedAt = Date.now()
    for (const id of new Set(ids)) {
      const row = await db.transactions.get(id)
      if (!row || outstandingAmount(row) <= 0) continue
      await db.transactions.update(id, { resolved: 1, updatedAt })
      changes.push({ id, resolved: row.resolved ?? 0, updatedAt })
    }
    return changes
  })
}

export async function undoOwedResolution(changes) {
  return db.transaction('rw', db.transactions, async () => {
    for (const change of changes) {
      const row = await db.transactions.get(change.id)
      if (!row || !row.resolved || row.updatedAt !== change.updatedAt) {
        throw new Error('An entry has changed since resolving. Open its transaction to update it.')
      }
    }
    for (const change of changes) {
      await db.transactions.update(change.id, { resolved: change.resolved, updatedAt: Date.now() })
    }
  })
}
