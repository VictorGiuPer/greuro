import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

export const supabaseConfigReady = Boolean(url && publishableKey)
export const supabase = supabaseConfigReady
  ? createClient(url, publishableKey, {
      // Auth credentials are held for this browser tab so page navigations in
      // the Supabase OAuth consent flow can return to the signed-in user.
      // Budget data is still read from and written only to Supabase.
      auth: { storage: window.sessionStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null
