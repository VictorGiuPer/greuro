import { useCallback, useEffect, useState } from 'react'
import { postDueScheduled, getSetting, setSetting } from './db'
import { isDatabaseEmpty } from './db/maintenance'
import BottomTabBar from './components/BottomTabBar'
import Toast from './components/ui/Toast'
import Onboarding from './components/onboarding/Onboarding'
import Dashboard from './pages/Dashboard'
import Transactions from './pages/Transactions'
import Reminders from './pages/Reminders'

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard')
  const [toast, setToast] = useState(null)
  const [boot, setBoot] = useState('loading') // loading | onboarding | ready

  // Boot: decide onboarding vs app, then auto-post any due scheduled
  // transactions and mention it quietly. postDueScheduled is idempotent
  // (StrictMode-safe), so the double-mounted dev effect is harmless.
  useEffect(() => {
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
      const n = await postDueScheduled()
      if (active && n > 0) setToast(`${n} scheduled transaction${n === 1 ? '' : 's'} added`)
    })()
    return () => {
      active = false
    }
  }, [])

  const clearToast = useCallback(() => setToast(null), [])

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

  if (boot === 'loading') {
    return <div className="min-h-dvh bg-bg" aria-busy="true" />
  }

  if (boot === 'onboarding') {
    return <Onboarding onComplete={completeOnboarding} />
  }

  return (
    <div className="flex min-h-dvh flex-col bg-bg text-txt-primary">
      <main className="flex-1">
        {activeTab === 'dashboard' && <Dashboard />}
        {activeTab === 'transactions' && <Transactions />}
        {activeTab === 'reminders' && <Reminders />}
      </main>
      <BottomTabBar activeTab={activeTab} onTabChange={changeTab} />
      <Toast message={toast} onDone={clearToast} />
    </div>
  )
}
