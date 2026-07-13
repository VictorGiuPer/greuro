import CategoryIcon from './CategoryIcon'
import { signedAmount } from '../lib/format'

const AMOUNT_CLASS = {
  expense: 'text-expense',
  income: 'text-income',
  transfer: 'text-txt-secondary',
}

/**
 * A single transaction row: icon tile, two-line text, right-aligned amount.
 *
 * @param categoriesById / accountsById  lookup maps for resolving labels.
 */
export default function TransactionRow({ tx, categoriesById, accountsById, onClick }) {
  const isTransfer = tx.type === 'transfer'
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
  } else {
    subtitle = category?.name ?? 'Uncategorized'
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-3 text-left active:bg-white/[0.03] transition-colors"
    >
      <CategoryIcon name={iconName} color={iconColor} />
      <div className="min-w-0 flex-1">
        <div className="text-txt-primary font-medium truncate">{title}</div>
        <div className="text-txt-secondary text-sm truncate">{subtitle}</div>
      </div>
      <div className={`font-semibold tabular-nums shrink-0 ${AMOUNT_CLASS[tx.type]}`}>
        {signedAmount(tx.type, tx.amount)}
      </div>
    </button>
  )
}
