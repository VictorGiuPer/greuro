import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
const authStorage = typeof window !== 'undefined' ? window.localStorage : undefined

export const supabaseConfigReady = Boolean(url && publishableKey)
export const supabase = supabaseConfigReady
  ? createClient(url, publishableKey, {
      // Keep the sign-in across browser/PWA restarts. Budget data itself remains
      // stored only in Supabase; localStorage contains the authentication session.
      auth: { storage: authStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null
