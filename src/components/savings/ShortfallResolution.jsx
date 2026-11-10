import { useCallback, useEffect, useState } from 'react'
import { readBudget, budgetAction } from '../../db/budgetActions'
import { savingsPool } from '../../lib/savings'
import ReleasePanel from './ReleasePanel'

export default function ShortfallResolution({ onResolved }) {
  const [conflict, setConflict] = useState(null)
  const [dismissed, setDismissed] = useState(false)
  const inspect = useCallback(async () => {
    const data = await readBudget()
    const pool = savingsPool(data)
    setConflict(pool.shortfall > 0 && pool.earmarked > 0 ? { ...pool, goals: data.goals.filter((g) => g.modelVersion === 2 && !g.archived && g.earmarked > 0) } : null)
  }, [])
  useEffect(() => {
    void inspect()
    const check = () => { if (document.visibilityState === 'visible') { setDismissed(false); void inspect() } }
    document.addEventListener('visibilitychange', check)
    window.addEventListener('budget-changed', inspect)
    return () => { document.removeEventListener('visibilitychange', check); window.removeEventListener('budget-changed', inspect) }
  }, [inspect])
  if (!conflict) return null
  if (dismissed) return <button onClick={() => setDismissed(false)} className="fixed bottom-24 left-1/2 z-40 w-[90%] max-w-[398px] -translate-x-1/2 rounded-xl bg-expense p-3 text-sm font-semibold text-black">Resolve underfunded savings</button>
  return <div role="dialog" aria-modal="true" aria-label="Resolve underfunded savings" className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-black/70 p-4"><div className="max-h-[90dvh] w-full max-w-[398px] overflow-y-auto rounded-2xl bg-bg p-3"><p className="px-2 pt-2 text-sm text-txt-secondary">Recorded transactions left some reserved savings uncovered. Release money to bring your goals up to date.</p><ReleasePanel conflict={conflict} onCancel={() => setDismissed(true)} onConfirm={async (releases) => { await budgetAction('pool.resolve', { releases }); await inspect(); onResolved?.() }} /></div></div>
}
