import { db } from './db'

/**
 * App settings — key-value rows in the `settings` store, merged over
 * DEFAULTS so new preferences never need a migration.
 */

import { SETTINGS_DEFAULTS } from '../lib/preferences'
export { SETTINGS_DEFAULTS }

/** All settings merged over defaults -> plain object. */
export async function getSettings() {
  const rows = await db.settings.toArray()
  const stored = Object.fromEntries(rows.map((r) => [r.key, r.value]))
  return { ...SETTINGS_DEFAULTS, ...stored }
}

/** One setting (or its default). */
export async function getSetting(key) {
  const row = await db.settings.get(key)
  return row ? row.value : SETTINGS_DEFAULTS[key]
}

/** Persist one setting. */
export async function setSetting(key, value) {
  await db.settings.put({ key, value })
}

/** Persist several settings at once ({ key: value, ... }). */
export async function setSettings(patch) {
  await db.settings.bulkPut(Object.entries(patch).map(([key, value]) => ({ key, value })))
}
