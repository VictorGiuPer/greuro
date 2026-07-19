import { PiggyBank, Target } from 'lucide-react'
import { formatAmount } from '../../lib/format'
import useCountUp from '../../lib/useCountUp'

/**
 * Savings tracker card on the Overview. Shows the active goal's progress,
 * derived from the main account's monthly surplus (see db/goals.js). Handles
 * the no-main-account and no-goal empty states.
 *
 * @param goal      active goal row or null
 * @param progress  computeGoalProgress() result or null
 * @param onCreate  () => void   open the goal form to create one
 * @param onEdit    () => void   open the goal form to edit the active goal
 * @param onAdd     () => void   open the quick add-to-savings sheet
 * @param onSetMain () => void   open Settings to choose a main account
 */
export default function SavingsCard({ goal, progress, onCreate, onEdit, onAdd, onSetMain }) {
  const saved = useCountUp(progress?.saved ?? 0)

  // No goal yet → invite to create one.
  if (!goal) {
    return (
      <section className="rounded-card border border-hairline bg-card p-4">
        <div className="mb-2 flex items-center gap-2">
          <PiggyBank size={16} className="text-txt-muted" aria-hidden="true" />
          <h2 className="text-sm font-medium text-txt-secondary">Savings Goal</h2>
        </div>
        <p className="mb-3 text-sm text-txt-muted">
          Set a goal and each month’s leftover money (what you don’t spend or invest) is banked
          toward it automatically.
        </p>
        <button
          onClick={onCreate}
          className="w-full rounded-2xl bg-accent/15 py-2.5 text-sm font-semibold text-accent hover:bg-accent/25"
        >
          Set a savings goal
        </button>
      </section>
    )
  }

  const noMain = progress?.noMain
  const pct = progress?.pct ?? 0
  const done = progress?.done
  const cur = progress?.currentMonthNet ?? 0
  const manual = progress?.manualAdjustment ?? 0

  return (
    <section className="rounded-card border border-hairline bg-card p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Target size={16} className={done ? 'text-accent' : 'text-txt-muted'} aria-hidden="true" />
          <h2 className="truncate text-sm font-medium text-txt-secondary">{goal.name}</h2>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {!noMain && (
            <button
              onClick={onAdd}
              className="rounded-full bg-accent/15 px-2.5 py-0.5 text-xs font-semibold text-accent hover:bg-accent/25"
            >
              + Add
            </button>
          )}
          <button
            onClick={onEdit}
            className="rounded-full px-2 py-0.5 text-xs font-medium text-txt-muted hover:text-txt-primary"
          >
            Edit
          </button>
        </div>
      </div>

      {!progress ? (
        // Progress is still being derived (brief async gap).
        <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-white/10" />
      ) : noMain ? (
        <>
          <p className="mb-3 text-sm text-txt-muted">
            Mark one account as your <span className="text-txt-primary">main account</span> so
            greuro knows where to measure your monthly surplus.
          </p>
          <button
            onClick={onSetMain}
            className="w-full rounded-2xl bg-accent/15 py-2.5 text-sm font-semibold text-accent hover:bg-accent/25"
          >
            Choose main account
          </button>
        </>
      ) : (
        <>
          <div className="flex items-end justify-between">
            <div className="text-xl font-bold tabular-nums text-accent">{formatAmount(saved)}</div>
            <div className="pb-0.5 text-xs text-txt-muted">of {formatAmount(goal.targetAmount)}</div>
          </div>

          {/* Progress bar */}
          <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>

          <div className="mt-2 flex items-center justify-between text-xs">
            {done ? (
              <span className="font-semibold text-accent">Goal reached 🎉</span>
            ) : (
              <span className="text-txt-muted">{formatAmount(progress.remaining)} to go</span>
            )}
            <span className="tabular-nums text-txt-muted">
              This month: {cur >= 0 ? '+' : '−'}
              {formatAmount(cur)} <span className="opacity-60">(pending)</span>
            </span>
          </div>
          {manual !== 0 && (
            <p className="mt-1 text-[11px] text-txt-muted">
              incl. {manual < 0 ? '−' : ''}
              {formatAmount(manual)} added manually
            </p>
          )}
        </>
      )}
    </section>
  )
}
