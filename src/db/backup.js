import { db } from './db'
import { setSetting } from './settings'

/**
 * JSON backup / restore — the complete, versioned dump of everything
 * (accounts, categories, transactions, scheduled, settings, goals).
 *
 * Restore modes:
 *   - replace: wipe all tables and load the backup verbatim, PRESERVING ids
 *     → export→import round-trips losslessly.
 *   - merge: reuse existing accounts (matched by case-insensitive name) and
 *     categories (name + kind); everything else is inserted with fresh ids
 *     and remapped references. Settings are NOT overwritten in merge mode.
 *
 * Nothing is written until applyBackup() — validateBackup() is the read-only
 * preview step. `goals` is optional so older backups still import cleanly.
 */

export const BACKUP_FORMAT = 'budget-app-backup'
export const BACKUP_VERSION = 1

const TABLES = ['accounts', 'categories', 'transactions', 'scheduled', 'settings', 'goals']
// Tables an older backup file MUST contain; goals may be absent (older export).
const REQUIRED_TABLES = ['accounts', 'categories', 'transactions', 'scheduled', 'settings']

/** Read the whole database into a plain versioned object. */
export async function buildBackup() {
  const [accounts, categories, transactions, scheduled, settings, goals] = await Promise.all(
    TABLES.map((t) => db[t].toArray()),
  )
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    data: { accounts, categories, transactions, scheduled, settings, goals },
  }
}

/** Build + download as a .json file, and remember the backup time. */
export async function exportBackupFile() {
  const backup = await buildBackup()
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `budget-backup-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
  await setSetting('lastBackupAt', Date.now())
}

/**
 * Validate a parsed backup object (read-only).
 * @returns {{ ok:true, counts:object, exportedAt:string } | { ok:false, error:string }}
 */
export function validateBackup(obj) {
  if (!obj || typeof obj !== 'object') return { ok: false, error: 'Not a JSON object.' }
  if (obj.format !== BACKUP_FORMAT) return { ok: false, error: 'Not a budget-app backup file.' }
  if (obj.version !== BACKUP_VERSION)
    return { ok: false, error: `Unsupported backup version ${obj.version}.` }
  if (!obj.data || typeof obj.data !== 'object') return { ok: false, error: 'Backup has no data.' }
  const counts = {}
  for (const t of REQUIRED_TABLES) {
    if (!Array.isArray(obj.data[t])) return { ok: false, error: `Backup is missing "${t}".` }
    counts[t] = obj.data[t].length
  }
  // goals is optional (absent in pre-v3 exports).
  counts.goals = Array.isArray(obj.data.goals) ? obj.data.goals.length : 0
  const badTx = obj.data.transactions.find(
    (t) => typeof t.amount !== 'number' || typeof t.date !== 'number' || !t.type,
  )
  if (badTx) return { ok: false, error: 'Backup contains malformed transactions.' }
  return { ok: true, counts, exportedAt: obj.exportedAt }
}

const stripId = ({ id, ...rest }) => rest
const nameKey = (s) => String(s ?? '').trim().toLowerCase()

/**
 * Write a validated backup into the database.
 * @param mode 'replace' | 'merge'
 * @returns per-table imported counts
 */
export async function applyBackup(obj, mode) {
  const valid = validateBackup(obj)
  if (!valid.ok) throw new Error(valid.error)
  const { accounts, categories, transactions, scheduled, settings } = obj.data
  const goals = Array.isArray(obj.data.goals) ? obj.data.goals : []

  const imported = { accounts: 0, categories: 0, transactions: 0, scheduled: 0, settings: 0, goals: 0 }

  await db.transaction('rw', TABLES.map((t) => db[t]), async () => {
    if (mode === 'replace') {
      await Promise.all(TABLES.map((t) => db[t].clear()))
      await db.accounts.bulkAdd(accounts)
      await db.categories.bulkAdd(categories)
      await db.transactions.bulkAdd(transactions)
      await db.scheduled.bulkAdd(scheduled)
      await db.settings.bulkAdd(settings)
      await db.goals.bulkAdd(goals)
      imported.accounts = accounts.length
      imported.categories = categories.length
      imported.transactions = transactions.length
      imported.scheduled = scheduled.length
      imported.settings = settings.length
      imported.goals = goals.length
      return
    }

    // ---- merge ----
    const existingAccounts = await db.accounts.toArray()
    const existingCategories = await db.categories.toArray()
    const accountByName = new Map(existingAccounts.map((a) => [nameKey(a.name), a.id]))
    const categoryByKey = new Map(
      existingCategories.map((c) => [`${nameKey(c.name)}|${c.kind}`, c.id]),
    )

    const accountIdMap = new Map()
    for (const a of accounts) {
      const match = accountByName.get(nameKey(a.name))
      if (match != null) {
        accountIdMap.set(a.id, match)
      } else {
        const newId = await db.accounts.add(stripId(a))
        accountByName.set(nameKey(a.name), newId)
        accountIdMap.set(a.id, newId)
        imported.accounts += 1
      }
    }

    const categoryIdMap = new Map()
    for (const c of categories) {
      const key = `${nameKey(c.name)}|${c.kind}`
      const match = categoryByKey.get(key)
      if (match != null) {
        categoryIdMap.set(c.id, match)
      } else {
        const newId = await db.categories.add(stripId(c))
        categoryByKey.set(key, newId)
        categoryIdMap.set(c.id, newId)
        imported.categories += 1
      }
    }

    const remapRefs = (row) => ({
      ...row,
      categoryId: row.categoryId != null ? (categoryIdMap.get(row.categoryId) ?? null) : null,
      accountId: row.accountId != null ? (accountIdMap.get(row.accountId) ?? null) : null,
      fromAccountId:
        row.fromAccountId != null ? (accountIdMap.get(row.fromAccountId) ?? null) : null,
      toAccountId: row.toAccountId != null ? (accountIdMap.get(row.toAccountId) ?? null) : null,
    })

    for (const t of transactions) {
      await db.transactions.add(remapRefs(stripId(t)))
      imported.transactions += 1
    }
    for (const s of scheduled) {
      await db.scheduled.add(remapRefs(stripId(s)))
      imported.scheduled += 1
    }
    // Goals carry no account/category refs — insert fresh.
    for (const g of goals) {
      await db.goals.add(stripId(g))
      imported.goals += 1
    }
    // Settings intentionally untouched in merge mode.
  })

  return imported
}
