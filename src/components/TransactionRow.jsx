import CategoryIcon from './CategoryIcon'
import { signedAmount, formatAmount } from '../lib/format'
import { effectiveAmount, outstandingAmount, isResolved } from '../lib/txAmount'

const AMOUNT_CLASS = {
  expense: 'text-expense',
  income: 'text-income',
  transfer: 'text-txt-secondary',
}

/**
 * A single transaction row: icon tile, two-line text, right-aligned amount.
 * The amount shown is the EFFECTIVE one (net of anything paid back), which is
 * also what every balance and statistic uses.
 *
 * @param categoriesById / accountsById  lookup maps for resolving labels.
 */
export default function TransactionRow({ tx, categoriesById, accountsById, onClick }) {
  const isTransfer = tx.type === 'transfer'
  const isAdjustment = Boolean(tx.isAdjustment)
  const category = isTransfer ? null : categoriesById.get(tx.categoryId)

  let title = tx.description
  let subtitle
  let iconName = category?.icon
  let iconColor = category?.color

  if (isTransfer) {
    const from = accountsById.get(tx.fromAccountId)?.name ?? '-'
    const to = accountsById.get(tx.toAccountId)?.name ?? '-'
    // Fall back to "From → To" when the transfer has no description.
    title = tx.description || `${from} → ${to}`
    subtitle = 'Transfer'
    iconName = 'ArrowLeftRight'
    iconColor = '#9BA1AC'
  } else if (isAdjustment) {
    // A balance correction: real for the balance, invisible to statistics.
    // The title already says "Balance adjustment", so name the account here.
    subtitle = accountsById.get(tx.accountId)?.name ?? 'Balance adjustment'
    iconName = 'Scale'
    iconColor = '#9BA1AC'
  } else {
    subtitle = category?.name ?? 'Uncategorized'
    const owedSoFar = outstandingAmount(tx)
    if (owedSoFar > 0) subtitle += ` · ${formatAmount(owedSoFar)} owed`
  }

  const owed = outstandingAmount(tx)
  const resolved = isResolved(tx)

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-3 text-left active:bg-white/[0.03] transition-colors"
    >
      <CategoryIcon name={iconName} color={iconColor} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate font-medium text-txt-primary">{title}</span>
          {owed > 0 && (
            <span className="shrink-0 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-300">
              Owed
            </span>
          )}
          {resolved && (
            <span className="shrink-0 rounded-full bg-accent/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-accent">
              Resolved
            </span>
          )}
        </div>
        <div className="text-txt-secondary text-sm truncate">{subtitle}</div>
      </div>
      <div
        className={`font-semibold tabular-nums shrink-0 ${
          isAdjustment ? 'text-txt-secondary' : AMOUNT_CLASS[tx.type]
        }`}
      >
        {signedAmount(tx.type, effectiveAmount(tx))}
      </div>
    </button>
  )
}
