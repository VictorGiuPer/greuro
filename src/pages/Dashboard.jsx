import { useCallback, useEffect, useMemo, useState } from 'react'
import { Settings as SettingsIcon, FileText } from 'lucide-react'
import {
  getAccounts,
  getCategories,
  getScheduled,
  getSettings,
  setSetting,
  spendingByCategory,
  incomeExpenseTotals,
  cashFlow,
  accountBalances,
  accountUsage,
  getActiveGoal,
  computeGoalProgress,
} from '../db'
import { periodRange, customRange, todayNoon, addDays } from '../lib/dates'
import { formatDate } from '../lib/format'
import PeriodPicker from '../components/dashboard/PeriodPicker'
import SpendingDonut from '../components/dashboard/SpendingDonut'
import SpendingFocus from '../components/dashboard/SpendingFocus'
import NetEarningsCard from '../components/dashboard/NetEarningsCard'
import CashFlowCard from '../components/dashboard/CashFlowCard'
import ForecastCard from '../components/dashboard/ForecastCard'
import SavingsCard from '../components/dashboard/SavingsCard'
import MonthlyReport from '../components/MonthlyReport'
import Settings from '../components/settings/Settings'
import TransactionForm from '../components/TransactionForm'
import GoalForm from '../components/GoalForm'
import AddSavingsSheet from '../components/AddSavingsSheet'
import Fab from '../components/ui/Fab'

/**
 * Overview tab — everything derived live from transactions for the selected
 * period: spending donut, net earnings, per-account cash flow, and the
 * forward net-worth forecast.
 */
export default function Dashboard() {
  const [accounts, setAccounts] = useState([])
  const [categories, setCategories] = useState([])
  const [scheduled, setScheduled] = useState([])
  const [settings, setSettingsState] = useState(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const [txFormOpen, setTxFormOpen] = useState(false)
  const [focusOpen, setFocusOpen] = useState(false)
  const [goalFormOpen, setGoalFormOpen] = useState(false)
  const [addSavingsOpen, setAddSavingsOpen] = useState(false)
  const [goal, setGoal] = useState(null)
  const [goalProgress, setGoalProgress] = useState(null)
  const [refreshToken, setRefreshToken] = useState(0)

  const [period, setPeriod] = useState({
    kind: 'month',
    customFrom: addDays(todayNoon(), -29),
    customTo: todayNoon(),
  })

  const [spending, setSpending] = useState([])
  const [totals, setTotals] = useState({ income: 0, expense: 0, net: 0 })
  const [flow, setFlow] = useState(null)
  const [balances, setBalances] = useState(null)

  const range = useMemo(
    () =>
      period.kind === 'custom'
        ? customRange(period.customFrom, period.customTo)
        : periodRange(period.kind),
    [period],
  )

  const reloadMeta = useCallback(async () => {
    const [accs, cats, sched, sett, activeGoal] = await Promise.all([
      getAccounts(),
      getCategories(),
      getScheduled(),
      getSettings(),
      getActiveGoal(),
    ])
    setAccounts(accs)
    setCategories(cats)
    setScheduled(sched)
    setSettingsState(sett)
    setGoal(activeGoal)
  }, [])

  useEffect(() => {
    reloadMeta()
  }, [reloadMeta])

  // The main everyday account (a persisted tag) — default for cash flow +
  // savings; falls back to the first active account.
  const mainAccountId = useMemo(() => {
    if (!settings) return null
    const stored = settings.mainAccountId
    if (stored != null && accounts.some((a) => a.id === stored)) return stored
    const firstActive = accounts.find((a) => accountUsage(a) === 'active')
    return firstActive?.id ?? accounts[0]?.id ?? null
  }, [settings, accounts])

  // The Cash Flow card's account: explicit choice, else main account.
  const cashFlowAccountId = useMemo(() => {
    if (!settings) return null
    const stored = settings.cashFlowAccountId
    if (stored != null && accounts.some((a) => a.id === stored)) return stored
    return mainAccountId
  }, [settings, accounts, mainAccountId])

  // Only investment-tagged accounts feed the growth projection.
  const investmentAccounts = useMemo(
    () => accounts.filter((a) => accountUsage(a) === 'investment'),
    [accounts],
  )

  // Period-dependent derivations.
  useEffect(() => {
    let active = true
    ;(async () => {
      const [sp, tot, bal] = await Promise.all([
        spendingByCategory(range),
        incomeExpenseTotals(range),
        accountBalances(),
      ])
      let fl = null
      if (cashFlowAccountId != null) {
        fl = await cashFlow({ accountId: cashFlowAccountId, from: range.from, to: range.to })
      }
      if (!active) return
      setSpending(sp)
      setTotals(tot)
      setFlow(fl)
      setBalances(bal)
    })()
    return () => {
      active = false
    }
  }, [range, cashFlowAccountId, refreshToken])

  // Savings goal progress — recomputed when the goal, main account or any
  // transaction (refreshToken) changes.
  useEffect(() => {
    let active = true
    ;(async () => {
      if (!goal) {
        setGoalProgress(null)
        return
      }
      const p = await computeGoalProgress(goal, mainAccountId)
      if (active) setGoalProgress(p)
    })()
    return () => {
      active = false
    }
  }, [goal, mainAccountId, refreshToken])

  const categoriesById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories])

  async function changeCashFlowAccount(id) {
    await setSetting('cashFlowAccountId', id)
    setSettingsState((s) => ({ ...s, cashFlowAccountId: id }))
  }

  async function changeForecastSetting(key, value) {
    await setSetting(key, value)
    setSettingsState((s) => ({ ...s, [key]: value }))
  }

  function handleTxSaved() {
    setTxFormOpen(false)
    setRefreshToken((n) => n + 1) // re-derive all dashboard numbers
  }

  async function handleGoalSaved() {
    setGoalFormOpen(false)
    await reloadMeta()
  }

  async function handleSavingsAdjusted() {
    setAddSavingsOpen(false)
    await reloadMeta()
  }

  const periodLabel =
    period.kind === 'custom'
      ? `${formatDate(range.from)} – ${formatDate(range.to)}`
      : `This ${period.kind}`

  return (
    <div className="relative min-h-dvh pb-24">
      <header className="safe-pt sticky top-0 z-30 flex min-h-[70px] items-center justify-between bg-bg/90 px-4 pb-2 backdrop-blur">
        <div className="flex items-center gap-2.5">
          {/* Brand mark (wordmark-free per branding) */}
          <img src={`${import.meta.env.BASE_URL}logo.png`} alt="greuro" className="h-8 w-8" />
          <h1 className="text-2xl font-semibold text-txt-primary">Overview</h1>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setReportOpen(true)}
            title="Monthly report"
            aria-label="Monthly report"
            className="flex h-[44px] w-[44px] items-center justify-center rounded-2xl border border-hairline bg-card text-txt-secondary hover:text-txt-primary"
          >
            <FileText size={18} />
          </button>
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            title="Settings"
            aria-label="Settings"
            className="flex h-[44px] w-[44px] items-center justify-center rounded-2xl border border-hairline bg-card text-txt-secondary hover:text-txt-primary"
          >
            <SettingsIcon size={18} />
          </button>
        </div>
      </header>

      <div className="space-y-4 px-4 pt-1">
        <PeriodPicker period={period} onChange={setPeriod} />

        <SpendingDonut
          rows={spending}
          categoriesById={categoriesById}
          onOpenFocus={() => setFocusOpen(true)}
        />

        <div className="grid grid-cols-2 gap-4">
          <NetEarningsCard totals={totals} />
          <CashFlowCard
            accounts={accounts}
            accountId={cashFlowAccountId}
            onAccountChange={changeCashFlowAccount}
            flow={flow}
          />
        </div>

        <SavingsCard
          goal={goal}
          progress={goalProgress}
          onCreate={() => setGoalFormOpen(true)}
          onEdit={() => setGoalFormOpen(true)}
          onAdd={() => setAddSavingsOpen(true)}
          onSetMain={() => setSettingsOpen(true)}
        />

        {settings && (
          <ForecastCard
            accounts={investmentAccounts}
            balances={balances}
            settings={settings}
            onSettingChange={changeForecastSetting}
          />
        )}
      </div>

      <SpendingFocus
        open={focusOpen}
        onClose={() => setFocusOpen(false)}
        rows={spending}
        categoriesById={categoriesById}
        periodLabel={periodLabel}
      />

      {/* Quick-add is available from every tab. */}
      <Fab onClick={() => setTxFormOpen(true)} label="Add transaction" />

      <TransactionForm
        open={txFormOpen}
        onClose={() => setTxFormOpen(false)}
        onSaved={handleTxSaved}
        accounts={accounts}
        categories={categories}
        editingTx={null}
        onMetaChanged={reloadMeta}
      />

      <GoalForm
        open={goalFormOpen}
        onClose={() => setGoalFormOpen(false)}
        onSaved={handleGoalSaved}
        editingGoal={goal}
      />

      <AddSavingsSheet
        open={addSavingsOpen}
        onClose={() => setAddSavingsOpen(false)}
        onSaved={handleSavingsAdjusted}
        goal={goal}
      />

      <MonthlyReport
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        categoriesById={categoriesById}
      />

      <Settings
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        accounts={accounts}
        categories={categories}
        onChanged={reloadMeta}
      />
    </div>
  )
}
