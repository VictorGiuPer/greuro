// Production database: all saved budget data is loaded from and persisted to
// the active user's Supabase account. Browser storage is never used.
import { cloudDb } from './cloudDatabase'

export const db = cloudDb
