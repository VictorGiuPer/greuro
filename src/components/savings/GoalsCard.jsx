import { useState } from 'react'
import { budgetAction } from '../../db/budgetActions'
import { goalProgress, legacyProgress, savingsPool } from '../../lib/savings'
import { formatAmount, parseAmountInput } from '../../lib/format'
import GoalEditorSheet from './GoalEditorSheet'

export default function GoalsCard({ data, onChanged }) {
  const [selected, setSelected] = useState('')
  const [editor, setEditor] = useState(null)
  const [amount, setAmount] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmation, setConfirmation] = useState(null)
  const [review, setReview] = useState(null)
  const goals = data.goals.filter((g) => !g.archived)
  const goal = goals.find((g) => String(g.id) === selected) || goals[0]
  const progress = goal && goalProgress(goal, data)
  const pool = savingsPool(data)
  async function run(action, input) {
    setBusy(true); setError('')
    try { const result = await budgetAction(action, input); await onChanged(); if (action === 'goal.add') { setSelected(String(result.id)) } setEditor(null); setConfirmation(null); setReview(null); setAmount(''); return result } catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  async function beginReview() {
    const suggestion = legacyProgress(goal, data).suggestedEarmark
    setReview(suggestion); setAmount(String(suggestion))
  }
  return <section className="rounded-card border border-hairline bg-card p-4">
    <div className="flex items-center justify-between gap-2"><h2 className="text-sm font-medium text-txt-secondary">Savings goals</h2><div className="flex shrink-0 items-center gap-1 text-xs font-medium text-accent">
      <button onClick={() => setEditor({})} className="rounded-full px-2 py-1.5 hover:bg-accent/10">+ New</button>
      {goal && <button onClick={() => setEditor({ id: goal.id })} className="rounded-full px-2 py-1.5 hover:bg-accent/10">Edit</button>}
      {goal && !progress.reviewRequired && <button disabled={busy} onClick={() => setConfirmation('finish')} className="rounded-full px-2 py-1.5 hover:bg-accent/10 disabled:opacity-40">Finish</button>}
    </div></div>
    <div className="my-3 text-xs text-txt-muted">Reserved {formatAmount(pool.earmarked)} · Available {pool.available < 0 ? '−' : ''}{formatAmount(pool.available)}</div>
    {goals.length > 0 ? <select aria-label="Savings goal" value={goal.id} onChange={(e) => { setSelected(e.target.value); setAmount(''); setError(''); setReview(null); setConfirmation(null) }} className="mb-3 w-full rounded-xl bg-elevated p-3 text-sm">{goals.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select> : <p className="text-sm text-txt-muted">Create a goal and reserve money for it.</p>}
    {progress && !progress.reviewRequired && <>
      <div className="mb-2 text-sm text-txt-secondary">Target {formatAmount(progress.target)}</div>
      <div role="img" aria-label={`${formatAmount(progress.spent)} spent, ${formatAmount(progress.earmarked)} reserved toward ${formatAmount(progress.target)}`} className="flex h-3 overflow-hidden rounded-full bg-white/10"><span style={{ width: `${progress.spentPct}%` }} className="bg-violet-400" /><span style={{ width: `${progress.earmarkedPct}%` }} className="bg-accent" /></div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-xs"><div className="text-violet-300">Spent<strong className="mt-1 block tabular-nums">{formatAmount(progress.spent)}</strong></div><div className="text-accent">Reserved<strong className="mt-1 block tabular-nums">{formatAmount(progress.earmarked)}</strong></div><div className="text-txt-secondary">To fund<strong className="mt-1 block tabular-nums">{formatAmount(progress.remaining)}</strong></div></div>
      {progress.overrun > 0 && <p className="mt-2 text-sm text-expense">{formatAmount(progress.overrun)} over target</p>}
      {progress.overrun === 0 && progress.overfunded > 0 && <p className="mt-2 text-sm text-txt-secondary">{formatAmount(progress.overfunded)} above target</p>}
      <div className="mt-4 flex items-center gap-2">
        <input aria-label="Reserve or release amount" inputMode="decimal" placeholder="Amount (€)" value={amount} onChange={(e) => setAmount(e.target.value)} className="min-h-[44px] min-w-0 flex-1 rounded-xl bg-elevated px-3 py-2 text-sm" />
        <button disabled={busy} onClick={() => run('goal.reserve', { id: goal.id, amount: parseAmountInput(amount) })} className="min-h-[44px] shrink-0 rounded-xl bg-accent px-3 text-sm font-semibold text-black disabled:opacity-40">Reserve</button>
        <button disabled={busy} onClick={() => run('goal.release', { id: goal.id, amount: parseAmountInput(amount) })} className="min-h-[44px] shrink-0 rounded-xl border border-hairline px-3 text-sm disabled:opacity-40">Release</button>
      </div>
    </>}
    {progress?.reviewRequired && <div className="text-sm"><p className="text-txt-secondary">Review the old automatically calculated amount before reserving money.</p><button onClick={beginReview} className="mt-2 min-h-[44px] text-accent">Review existing savings</button>{review !== null && <><p className="mt-2 text-xs">Previously calculated: {formatAmount(review)}. Available: {formatAmount(pool.available)}.</p><input aria-label="Legacy savings to reserve" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" className="mt-2 w-full rounded-xl bg-elevated p-3" /><button disabled={busy} onClick={() => run('goal.review', { id: goal.id, amount: parseAmountInput(amount) })} className="mt-2 min-h-[44px] text-accent">Confirm reserve</button></>}</div>}
    {editor && <GoalEditorSheet open goal={data.goals.find((g) => g.id === editor.id)} data={data} onClose={() => setEditor(null)} onSaved={async (result) => { if (!editor.id) setSelected(String(result.id)); await onChanged() }} />}
    {confirmation && goal && <div role="group" aria-label="Confirm goal finish" className="mt-3 rounded-xl bg-elevated p-3 text-sm"><p>{confirmation === 'finish' ? 'Finish' : 'Delete'} {goal.name} and release {formatAmount(progress.earmarked)}?</p>{confirmation === 'finish' && <p className="mt-1 text-xs text-txt-muted">Also archives: {data.trips.filter((t) => t.goalId === goal.id).map((t) => t.name).join(', ') || 'No linked trips'}</p>}<div className="mt-2 flex gap-4"><button disabled={busy} onClick={() => run(confirmation === 'finish' ? 'goal.finish' : 'goal.delete', { id: goal.id, confirm: true })} className="min-h-[44px] text-accent">Confirm</button><button onClick={() => setConfirmation(null)}>Cancel</button></div></div>}
    {error && <p role="alert" className="mt-2 text-sm text-expense">{error}</p>}
  </section>
}
