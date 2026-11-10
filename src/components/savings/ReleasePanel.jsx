import { useState } from 'react'
import { formatAmount, parseAmountInput } from '../../lib/format'
import { releaseSuggestions } from '../../lib/savings'

export default function ReleasePanel({ conflict, onConfirm, onCancel, busy = false }) {
  const [releases, setReleases] = useState({})
  const [error, setError] = useState('')
  const total = Object.values(releases).reduce((sum, value) => sum + (parseAmountInput(value) || 0), 0)
  async function submit() {
    try {
      setError('')
      await onConfirm(Object.entries(releases).filter(([, value]) => (parseAmountInput(value) || 0) > 0).map(([goalId, amount]) => ({ goalId: Number(goalId), amount: parseAmountInput(amount) })))
    } catch (e) { setError(e.message) }
  }
  return <div className="my-3 rounded-2xl border border-expense/40 bg-card p-4" role="group" aria-label="Release savings">
    <h3 className="font-semibold">Release savings to cover {formatAmount(conflict.shortfall)}</h3>
    {conflict.goals.map((g) => <div key={g.id} className="mt-3">
      <div className="text-sm">{g.name} · {formatAmount(g.earmarked)} reserved</div>
      <div className="mt-2 flex flex-wrap gap-2">{releaseSuggestions(Math.max(0, conflict.shortfall - total + (parseAmountInput(releases[g.id]) || 0)), g.earmarked).map((value) => <button type="button" key={value} onClick={() => setReleases((r) => ({ ...r, [g.id]: String(value) }))} className="min-h-[44px] rounded-xl border border-hairline px-3 text-xs">{formatAmount(value)}</button>)}</div>
      <input aria-label={`Custom release from ${g.name}`} inputMode="decimal" placeholder="Custom amount (€)" value={releases[g.id] || ''} onChange={(e) => setReleases((r) => ({ ...r, [g.id]: e.target.value }))} className="mt-2 w-full rounded-xl bg-elevated p-3 text-sm" />
    </div>)}
    {error && <p role="alert" className="mt-2 text-sm text-expense">{error}</p>}
    <div className="mt-3 flex gap-2"><button type="button" disabled={busy || total + 0.001 < conflict.shortfall} onClick={submit} className="min-h-[44px] rounded-xl bg-accent px-4 text-sm font-semibold text-black disabled:opacity-40">Release & save</button><button type="button" onClick={onCancel} className="min-h-[44px] px-3 text-sm">Cancel</button></div>
  </div>
}
