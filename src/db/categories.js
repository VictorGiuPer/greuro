import { db } from './db'

/** Category reads + writes, with a referential-integrity guard on delete. */

export function getCategories() {
  return db.categories.orderBy('name').toArray()
}

/** Categories filtered by kind ('expense' | 'income'), sorted by name. */
export function getCategoriesByKind(kind) {
  return db.categories.where('kind').equals(kind).sortBy('name')
}

/** Count transactions that reference this category. */
export function countCategoryUsage(id) {
  return db.transactions.where('categoryId').equals(id).count()
}

export async function addCategory(data) {
  const now = Date.now()
  return db.categories.add({
    name: (data.name ?? '').trim(),
    kind: data.kind === 'income' ? 'income' : 'expense',
    color: data.color || '#818CF8',
    icon: data.icon || 'Circle',
    // "Balance only": still moves account balances, but ignored by stats.
    excludeFromStats: Boolean(data.excludeFromStats),
    createdAt: now,
    updatedAt: now,
  })
}

export async function updateCategory(id, patch) {
  const clean = { updatedAt: Date.now() }
  if (patch.name != null) clean.name = String(patch.name).trim()
  if (patch.kind != null) clean.kind = patch.kind === 'income' ? 'income' : 'expense'
  if (patch.color != null) clean.color = patch.color
  if (patch.icon != null) clean.icon = patch.icon
  if (patch.excludeFromStats != null) clean.excludeFromStats = Boolean(patch.excludeFromStats)
  return db.categories.update(id, clean)
}

/**
 * Delete a category only if no transaction references it. Never orphans data.
 * @returns {{ ok: true } | { ok: false, count: number }}
 */
export async function deleteCategory(id) {
  const count = await countCategoryUsage(id)
  if (count > 0) return { ok: false, count }
  await db.categories.delete(id)
  return { ok: true }
}
