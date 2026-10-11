import { useEffect, useState } from 'react'
import { LockKeyhole } from 'lucide-react'
import { supabase, supabaseConfigReady } from '../lib/supabase'
import '../index.css'

function OAuthSignIn({ onSignedIn }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })
    setBusy(false)
    if (signInError) {
      setError(signInError.message || 'Could not sign in. Check your email and password.')
      return
    }
    onSignedIn(data.session)
  }

  return (
    <form onSubmit={submit} className="mt-7 space-y-4">
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-txt-secondary">Email</span>
        <input type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} className="w-full rounded-2xl border border-hairline bg-card px-4 py-3 text-txt-primary outline-none focus:border-accent" />
      </label>
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-txt-secondary">Password</span>
        <input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} className="w-full rounded-2xl border border-hairline bg-card px-4 py-3 text-txt-primary outline-none focus:border-accent" />
      </label>
      {error && <p className="text-sm text-expense" role="alert">{error}</p>}
      <button disabled={busy} className="w-full rounded-2xl bg-accent px-5 py-3.5 font-semibold text-black disabled:opacity-50">
        {busy ? 'Signing in…' : 'Sign in to continue'}
      </button>
    </form>
  )
}

export default function OAuthConsent() {
  const authorizationId = new URLSearchParams(window.location.search).get('authorization_id')
  const [user, setUser] = useState(null)
  const [details, setDetails] = useState(null)
  const [status, setStatus] = useState('loading')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    if (!supabaseConfigReady || !authorizationId) {
      setStatus('error')
      setError(!supabaseConfigReady
        ? 'Supabase is not configured for this deployment.'
        : 'This authorization request is missing its authorization ID. Return to your MCP client and try connecting again.')
      return () => { active = false }
    }

    const loadAuthorization = async (session) => {
      if (!active) return
      if (!session?.user) {
        setUser(null)
        setDetails(null)
        setStatus('signed-out')
        return
      }
      setUser(session.user)
      setStatus('loading')
      setError('')
      const { data, error: detailsError } = await supabase.auth.oauth.getAuthorizationDetails(authorizationId)
      if (!active) return
      if (detailsError) {
        setStatus('error')
        setError(detailsError.message || 'Could not load the authorization request.')
      } else if ('redirect_url' in data) {
        window.location.assign(data.redirect_url)
      } else if (data.user.id !== session.user.id) {
        setStatus('error')
        setError('This request belongs to a different signed-in account. Sign out and reconnect with the correct account.')
      } else {
        setDetails(data)
        setStatus('ready')
      }
    }

    supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active) return
      if (sessionError) {
        setStatus('error')
        setError(sessionError.message || 'Could not check your sign-in session.')
      } else {
        void loadAuthorization(data.session)
      }
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      void loadAuthorization(session)
    })
    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [authorizationId])

  async function decide(approve) {
    setBusy(true)
    setError('')
    const method = approve ? 'approveAuthorization' : 'denyAuthorization'
    const { data, error: decisionError } = await supabase.auth.oauth[method](authorizationId, { skipBrowserRedirect: true })
    if (decisionError) {
      setBusy(false)
      setError(decisionError.message || 'Could not complete your decision. Please try again.')
      return
    }
    window.location.assign(data.redirect_url)
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col justify-center bg-bg px-6 py-10 text-txt-primary">
      <div className="mb-8 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/15 text-accent">
        <LockKeyhole size={25} aria-hidden="true" />
      </div>
      <h1 className="text-2xl font-bold">Connect to greuro</h1>
      <p className="mt-2 text-sm leading-relaxed text-txt-secondary">
        {status === 'signed-out'
          ? 'Sign in to choose whether to share your Greuro budget with this MCP client.'
          : 'Review the access request before continuing.'}
      </p>

      {status === 'signed-out' && <OAuthSignIn onSignedIn={() => setStatus('loading')} />}
      {status === 'loading' && <p className="mt-6 text-sm text-txt-secondary" aria-live="polite">Loading authorization request…</p>}
      {status === 'ready' && details && (
        <section className="mt-6 rounded-2xl border border-hairline bg-card p-5" aria-labelledby="request-title">
          <h2 id="request-title" className="text-lg font-semibold">{details.client.name || 'An MCP client'} is requesting access</h2>
          <p className="mt-2 text-sm text-txt-secondary">Signed in as {user?.email}</p>
          <div className="mt-5">
            <h3 className="text-sm font-semibold">Requested permissions</h3>
            <ul className="mt-2 space-y-1 text-sm text-txt-secondary">
              {(details.scope || 'No scopes specified').split(' ').filter(Boolean).map((scope) => <li key={scope}>• {scope}</li>)}
            </ul>
          </div>
          <p className="mt-4 break-all text-xs text-txt-muted">Return address: {details.redirect_uri}</p>
          {details.client.uri && <a href={details.client.uri} target="_blank" rel="noreferrer" className="mt-3 inline-block text-sm text-accent underline">About this client</a>}
          <div className="mt-6 grid grid-cols-2 gap-3">
            <button type="button" disabled={busy} onClick={() => void decide(false)} className="rounded-2xl border border-hairline px-4 py-3 font-semibold disabled:opacity-50">Deny</button>
            <button type="button" disabled={busy} onClick={() => void decide(true)} className="rounded-2xl bg-accent px-4 py-3 font-semibold text-black disabled:opacity-50">{busy ? 'Working…' : 'Allow'}</button>
          </div>
        </section>
      )}
      {status === 'error' && <div className="mt-6 rounded-2xl border border-expense/30 bg-card p-4 text-sm text-expense" role="alert">{error}</div>}
      {error && status !== 'error' && <p className="mt-4 text-sm text-expense" role="alert">{error}</p>}
      <p className="mt-6 text-center text-xs leading-relaxed text-txt-muted">If you allow this connection, its MCP tools can read and change your Greuro budget. The connection cannot clear the entire budget or delete the database. You can close this page to cancel.</p>
    </main>
  )
}
