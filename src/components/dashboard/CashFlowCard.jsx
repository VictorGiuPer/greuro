import { ChevronDown } from 'lucide-react'
import { formatAmount } from '../../lib/format'
import useCountUp from '../../lib/useCountUp'

/**
 * Cash flow for ONE selectable account over the period — transfers COUNT
 * here (this card shows the account's health). The account choice persists
 * (settings.cashFlowAccountId), handled by the parent.
 */
export default function CashFlowCard({ accounts, accountId, onAccountChange, flow }) {
  const net = useCountUp(flow?.net ?? 0)
  const negative = (flow?.net ?? 0) < 0
  return (
    <section className="rounded-card border border-hairline bg-card p-4">
      <h2 className="mb-2 text-sm font-medium text-txt-secondary">Cash Flow</h2>
      <div
        className={`text-xl font-bold tabular-nums ${negative ? 'text-expense' : 'text-accent'}`}
      >
        {negative ? '-' : ''}
        {formatAmount(net)}
      </div>
      {/* Account picker sits below the number now, with room to read in full. */}
      <div className="relative mt-1.5">
        <select
          value={accountId ?? ''}
          onChange={(e) => onAccountChange(Number(e.target.value))}
          aria-label="Cash flow account"
          className="w-full appearance-none truncate rounded-lg border border-hairline bg-elevated py-1 pl-2.5 pr-6 text-xs text-txt-secondary focus:outline-none focus:ring-1 focus:ring-accent/50"
        >
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <ChevronDown
          size={13}
          className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-txt-muted"
          aria-hidden="true"
        />
      </div>
    </section>
  )
}
