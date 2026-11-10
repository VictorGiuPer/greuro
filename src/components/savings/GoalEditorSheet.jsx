import { useEffect, useState } from 'react'
import { budgetAction } from '../../db/budgetActions'
import { formatAmount, parseAmountInput, toAmountInputValue } from '../../lib/format'
import Sheet from '../ui/Sheet'

export default function GoalEditorSheet({ open, goal, data, onClose, onSaved }) {
  const [name, setName] = useState('')
  const [target, setTarget] = useState('')
  const [confirmation, setConfirmation] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!open) return
    setName(goal?.name || '')
    setTarget(goal ? toAmountInputValue(goal.targetAmount) : '')
    setConfirmation(null)
    setError('')
  }, [open, goal?.id])

  async function run(action, input) {
    setBusy(true)
    setError('')
    try {
      const result = await budgetAction(action, input)
      await onSaved(result)
      onClose()
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  const linkedTrips = goal ? data.trips.filter((t) => t.goalId === goal.id) : []
  const canDelete = goal && !data.transactions.some((t) => t.goalId === goal.id) && linkedTrips.length === 0
  const legacy = goal && goal.modelVersion !== 2
  return <Sheet open={open} onClose={onClose} label={goal ? 'Edit savings goal' : 'New savings goal'}>
    <form className="space-y-3" onSubmit={(e) => {
      e.preventDefault()
      void run(goal ? 'goal.update' : 'goal.add', { id: goal?.id, fields: { name: name.trim(), targetAmount: parseAmountInput(target) } })
    }}>
      <h2 className="mb-3 text-lg font-semibold">{goal ? 'Edit savings goal' : 'New savings goal'}</h2>
      {goal?.archived ? <p className="text-xs text-txt-muted">Archived</p> : null}
      <label className="block text-sm text-txt-secondary">Name<input aria-label="Goal name" value={name} onChange={(e) => setName(e.target.value)} required className="mt-1.5 w-full rounded-xl bg-elevated p-3 text-txt-primary" /></label>
      <label className="block text-sm text-txt-secondary">Target (€)<input aria-label="Goal target" value={target} onChange={(e) => setTarget(e.target.value)} inputMode="decimal" required className="mt-1.5 w-full rounded-xl bg-elevated p-3 text-txt-primary" /></label>
      <div className="flex flex-wrap gap-4 text-sm">
        <button disabled={busy} className="min-h-[44px] text-accent">Save goal</button>
        <button type="button" disabled={busy} onClick={onClose} className="min-h-[44px]">Cancel</button>
        {goal && !legacy && <button type="button" disabled={busy} onClick={() => setConfirmation(goal.archived ? 'reopen' : 'finish')} className="min-h-[44px] text-accent">{goal.archived ? 'Reopen goal' : 'Finish goal'}</button>}
        {canDelete && <button type="button" disabled={busy} onClick={() => setConfirmation('delete')} className="min-h-[44px] text-expense">Delete</button>}
      </div>
      {legacy && goal.archived && <div className="rounded-xl bg-elevated p-3 text-sm">
        <p>Review this older goal before reopening it. No money will be reserved.</p>
        <button type="button" disabled={busy} onClick={() => run('goal.review', { id: goal.id, amount: 0 })} className="mt-2 min-h-[44px] text-accent">Confirm review</button>
      </div>}
      {confirmation && <div role="group" aria-label="Confirm savings goal action" className="rounded-xl bg-elevated p-3 text-sm">
        <p>{confirmation === 'finish' ? `Finish ${goal.name} and release ${formatAmount(goal.earmarked)}?` : confirmation === 'reopen' ? `Reopen ${goal.name}? No money will be reserved automatically.` : `Delete ${goal.name} and release ${formatAmount(goal.earmarked)}?`}</p>
        {confirmation !== 'delete' && linkedTrips.length > 0 && <p className="mt-2 text-xs text-txt-secondary">Also {confirmation === 'finish' ? 'archives' : 'reopens'}: {linkedTrips.map((t) => t.name).join(', ')}</p>}
        <div className="mt-2 flex gap-4"><button type="button" disabled={busy} onClick={() => run(`goal.${confirmation}`, { id: goal.id, confirm: true })} className="min-h-[44px] text-accent">Confirm</button><button type="button" disabled={busy} onClick={() => setConfirmation(null)}>Cancel</button></div>
      </div>}
      {error && <p role="alert" className="text-sm text-expense">{error}</p>}
    </form>
  </Sheet>
}
