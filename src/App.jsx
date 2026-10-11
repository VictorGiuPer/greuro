import { useCallback, useEffect, useState } from 'react'
import { postDueScheduled, getSetting, setSetting } from './db'
import { isDatabaseEmpty } from './db/maintenance'
import { supabase, supabaseConfigReady } from './lib/supabase'
import { cloudDb } from './db/cloudDatabase'
import { parsePrefillFromSearch } from './lib/prefill'
import BottomTabBar from './components/BottomTabBar'
import Toast from './components/ui/Toast'
import Onboarding from './components/onboarding/Onboarding'
import Dashboard from './pages/Dashboard'
import Transactions from './pages/Transactions'
import Reminders from './pages/Reminders'
import SupabaseSignIn from './components/SupabaseSignIn'

export default function App() {
  const [auth, setAuth] = useState({ status: 'loading', user: null, error: '' })
  const [activeTab, setActiveTab] = useState('dashboard')
  const [toast, setToast] = useState(null)
  const [boot, setBoot] = useState('loading') // loading | onboarding | ready
  // Android auto-fill: an amount arriving via share/URL → prefill a new tx.
  const [prefillAmount, setPrefillAmount] = useState(null)

  useEffect(() => {
    if (!supabaseConfigReady) {
      setAuth({ status: 'config-error', user: null, error: '' })
      return
    }
    let active = true
    let generation = 0
    const activateSession = async (session) => {
      const current = ++generation
      if (!session?.user) {
        cloudDb.clearSession()
        if (active) setAuth({ status: 'signed-out', user: null, error: '' })
        return
      }
      if (active) setAuth({ status: 'loading', user: null, error: '' })
      try {
        await cloudDb.initialize(session.user.id)
        if (active && current === generation) setAuth({ status: 'ready', user: session.user, error: '' })
      } catch (error) {
        cloudDb.clearSession()
        if (active && current === generation) setAuth({ status: 'error', user: null, error: error.message || 'Could not load your Supabase data.' })
      }
    }

    supabase.auth.getSession().then(({ data, error }) => {
      if (error) setAuth({ status: 'error', user: null, error: error.message })
      else void activateSession(data.session)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      // Defer database work out of the Supabase auth callback.
      window.setTimeout(() => void activateSession(session), 0)
    })
    return () => {
      active = false
      generation += 1
      subscription.unsubscribe()
    }
  }, [])

  // Boot: decide onboarding vs app, then auto-post any due scheduled
  // transactions and mention it quietly. postDueScheduled is idempotent
  // (StrictMode-safe), so the double-mounted dev effect is harmless.
  useEffect(() => {
    if (auth.status !== 'ready') {
      setBoot('loading')
      return
    }
    let active = true
    ;(async () => {
      let onboarded = await getSetting('onboarded')
      if (!onboarded && !(await isDatabaseEmpty())) {
        // Existing data from before onboarding shipped — don't ask again.
        await setSetting('onboarded', true)
        onboarded = true
      }
      if (!active) return
      if (!onboarded) {
        setBoot('onboarding')
        return
      }
      setBoot('ready')

      // Consume any share/URL prefill: land on the dashboard, open a new
      // transaction with the amount filled, then clean the URL so a reload
      // doesn't re-trigger it.
      const pf = parsePrefillFromSearch(window.location.search)
      if (pf) {
        setActiveTab('dashboard')
        setPrefillAmount(pf.amount)
        window.history.replaceState({}, '', import.meta.env.BASE_URL)
      }

      const n = await postDueScheduled()
      if (active && n > 0) setToast(`${n} scheduled transaction${n === 1 ? '' : 's'} added`)
    })()
    return () => {
      active = false
    }
  }, [auth.status, auth.user?.id])

  const clearToast = useCallback(() => setToast(null), [])
  const clearPrefill = useCallback(() => setPrefillAmount(null), [])

  // Each tab is a fresh mount; reset scroll so a long list's offset doesn't
  // carry over as a jump on the next screen.
  const changeTab = useCallback((tab) => {
    setActiveTab(tab)
    window.scrollTo(0, 0)
  }, [])

  const completeOnboarding = useCallback(async () => {
    await setSetting('onboarded', true)
    setBoot('ready')
  }, [])

  if (auth.status === 'config-error') return <SupabaseSignIn configError />
  if (auth.status === 'error') return <SupabaseSignIn error={auth.error} onRetry={() => window.location.reload()} />
  if (auth.status === 'signed-out') return <SupabaseSignIn />
  if (auth.status === 'loading') return <div className="min-h-dvh bg-bg" aria-busy="true" />
  const handleSignOut = async () => { await supabase.auth.signOut() }

  if (boot === 'loading') {
    return <div className="min-h-dvh bg-bg" aria-busy="true" />
  }

  if (boot === 'onboarding') {
    return <Onboarding onComplete={completeOnboarding} />
  }

  return (
    <div className="flex min-h-dvh flex-col bg-bg text-txt-primary">
      <main className="flex-1">
        {activeTab === 'dashboard' && (
          <Dashboard prefillAmount={prefillAmount} onPrefillConsumed={clearPrefill} user={auth.user} onSignOut={handleSignOut} />
        )}
        {activeTab === 'transactions' && <Transactions />}
        {activeTab === 'reminders' && <Reminders />}
      </main>
      <BottomTabBar activeTab={activeTab} onTabChange={changeTab} />
      <Toast message={toast} onDone={clearToast} />
    </div>
  )
}
