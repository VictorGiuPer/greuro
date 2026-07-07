import { ArrowDownLeft, ArrowUpRight } from 'lucide-react'
import { formatAmount } from '../../lib/format'
import useCountUp from '../../lib/useCountUp'
import TrendBadge from './TrendBadge'

/**
 * Cash flow for ONE selectable account over the period — transfers COUNT
 * here (this card shows the account's health). The account choice persists
 * (settings.cashFlowAccountId), handled by the parent.
 */
export default function CashFlowCard({
  accounts,
  accountId,
  onAccountChange,
  flow,
  prevFlow,
  compareLabel,
}) {
  const net = useCountUp(flow?.net ?? 0)
  const negative = (flow?.net ?? 0) < 0
  return (
    <section className="rounded-card border border-hairline bg-card p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="shrink-0 text-sm font-medium text-txt-secondary">Cash Flow</h2>
        <select
          value={accountId ?? ''}
          onChange={(e) => onAccountChange(Number(e.target.value))}
          aria-label="Cash flow account"
          className="min-w-0 appearance-none truncate rounded-full border border-hairline bg-elevated px-2.5 py-1 text-xs text-txt-secondary focus:outline-none focus:ring-1 focus:ring-accent/50"
        >
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </div>
      <div
        className={`text-xl font-bold tabular-nums ${negative ? 'text-expense' : 'text-accent'}`}
      >
        {negative ? '-' : ''}
        {formatAmount(net)}
      </div>
      <TrendBadge current={flow?.net ?? 0} previous={prevFlow?.net} compareLabel={compareLabel} />
      <div className="mt-2 flex items-center gap-3 text-xs text-txt-muted">
        <span className="flex items-center gap-1">
          <ArrowDownLeft size={13} className="text-income" aria-hidden="true" />
          {formatAmount(flow?.inflow ?? 0)}
        </span>
        <span className="flex items-center gap-1">
          <ArrowUpRight size={13} className="text-expense" aria-hidden="true" />
          {formatAmount(flow?.outflow ?? 0)}
        </span>
      </div>
    </section>
  )
}
