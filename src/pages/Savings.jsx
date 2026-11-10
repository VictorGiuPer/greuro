import { useCallback, useEffect, useState } from 'react'
import { buildBackup } from '../db/backup'
import { getSettings, setSetting } from '../db'
import { allocationHistory, balancesFor } from '../lib/savings'
import GoalsCard from '../components/savings/GoalsCard'
import AllocationCard from '../components/savings/AllocationCard'
import ForecastCard from '../components/dashboard/ForecastCard'
import TransactionForm from '../components/TransactionForm'
import Fab from '../components/ui/Fab'

export default function Savings() {
  const [data, setData] = useState(null)
  const [settings, setSettings] = useState(null)
  const [open, setOpen] = useState(false)
  const [error, setError] = useState('')
  const reload = useCallback(async () => {
    try { const [backup, preferences] = await Promise.all([buildBackup(), getSettings()]); setData(backup.data); setSettings(preferences) } catch (e) { setError(e.message) }
  }, [])
  useEffect(() => { void reload() }, [reload])
  async function changeSetting(key, value) { try { await setSetting(key, value); await reload() } catch (e) { setError(e.message) } }
  return <div className="safe-pb pb-28">
    <header className="safe-pt sticky top-0 z-30 flex min-h-[70px] items-center bg-bg/90 px-4 pb-2 backdrop-blur">
      <h1 className="text-2xl font-semibold text-txt-primary">Savings</h1>
    </header>
    {error && <p role="alert" className="px-4 text-sm text-expense">{error}</p>}
    {data && settings ? <div className="space-y-4 px-4">
      <AllocationCard rows={allocationHistory(data, Date.now(), 'Europe/Brussels', { averageMonths: settings.savingsAverageMonths })} data={data} onAverageMonthsChange={(months) => changeSetting('savingsAverageMonths', months)} />
      <GoalsCard data={data} onChanged={reload} />
      <ForecastCard accounts={data.accounts.filter((a) => a.usage === 'investment')} balances={balancesFor(data)} settings={settings} onSettingChange={changeSetting} />
      <TransactionForm open={open} onClose={() => setOpen(false)} onSaved={() => { setOpen(false); void reload() }} accounts={data.accounts} categories={data.categories} trips={data.trips} onMetaChanged={reload} />
    </div> : <p className="px-4 text-sm text-txt-muted">Loading savings…</p>}
    <Fab onClick={() => setOpen(true)} label="Add transaction" />
  </div>
}
