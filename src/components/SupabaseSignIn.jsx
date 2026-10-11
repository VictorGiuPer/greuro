import { useState } from 'react'
import { LockKeyhole } from 'lucide-react'
import { supabase } from '../lib/supabase'

export default function SupabaseSignIn({ configError = false, error: setupError = '', onRetry }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const { error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
      if (authError) throw authError
    } catch (err) {
      setError(err.message || 'Could not sign in. Check your email and password, then try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col justify-center bg-bg px-6 py-10 text-txt-primary">
      <div className="mb-8 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/15 text-accent">
        <LockKeyhole size={25} aria-hidden="true" />
      </div>
      <h1 className="text-2xl font-bold">Sign in to Greuro</h1>
      <p className="mt-2 text-sm leading-relaxed text-txt-secondary">
        Your budget is saved to your private Supabase account. An internet connection is required.
      </p>
      {(configError || setupError) ? (
        <div className="mt-6 rounded-2xl border border-expense/30 bg-card p-4 text-sm text-expense" role="alert">
          {setupError || 'Supabase is not configured for this deployment. Add the project URL and publishable key, then rebuild the app.'}
          {onRetry && <button type="button" onClick={onRetry} className="mt-3 block font-semibold underline">Try again</button>}
        </div>
      ) : (
        <form onSubmit={submit} className="mt-7 space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-txt-secondary">Email</span>
            <input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-2xl border border-hairline bg-card px-4 py-3 text-txt-primary outline-none focus:border-accent" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-txt-secondary">Password</span>
            <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className="w-full rounded-2xl border border-hairline bg-card px-4 py-3 text-txt-primary outline-none focus:border-accent" />
          </label>
          {error && <p className="text-sm text-expense" role="alert">{error}</p>}
          <button disabled={busy} className="w-full rounded-2xl bg-accent px-5 py-3.5 font-semibold text-black disabled:opacity-50">
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
          <p className="text-center text-xs leading-relaxed text-txt-muted">Accounts are created by the app owner. Contact Victor if you need access.</p>
        </form>
      )}
    </main>
  )
}
