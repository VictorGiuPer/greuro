import { db } from './db'

/**
 * App settings — key-value rows in the `settings` store, merged over
 * DEFAULTS so new preferences never need a migration.
 */

export const SETTINGS_DEFAULTS = {
  // Forecast scenario annual return assumptions (%). The per-account
  // expectedAnnualReturn is scaled by pess/base and opt/base for the bands.
  returnPess: 5,
  returnBase: 7,
  returnOpt: 9,
  // Inflation (% p.a.) + whether the forecast defaults to real values.
  inflationRate: 2,
  inflationAdjust: false,
  forecastHorizonYears: 10,
  // "Standard investment": €/month assumed to keep flowing into the
  // highest-return account in the forecast (shows compound growth).
  monthlyInvestment: 0,
  // Reminders "Due Soon" badge thresholds (days).
  dueSoonAmberDays: 3,
  dueSoonTealDays: 7,
  // First-run flow.
  onboarded: false,
  // Data management.
  lastBackupAt: null,
  // Dashboard: which account the Cash Flow card shows (falls back to main).
  cashFlowAccountId: null,
  // The everyday account the savings tracker + cash-flow default use.
  mainAccountId: null,
}

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
