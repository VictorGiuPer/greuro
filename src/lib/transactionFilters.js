import { endOfDayMs } from './dates'
import { formatDate } from './format'

// Each Transactions view owns fresh arrays. Never seed this from Overview.
export function createTransactionFilters() {
  return {
    types: [], categoryIds: [], accountIds: [], tripIds: [],
    owedOnly: false, dateFrom: null, dateTo: null,
  }
}

export function transactionDateLabel({ dateFrom, dateTo }) {
  if (dateFrom != null && dateTo != null) {
    const from = new Date(dateFrom)
    const last = new Date(from.getFullYear(), from.getMonth() + 1, 0)
    const first = new Date(from.getFullYear(), from.getMonth(), 1).getTime()
    if (dateFrom === first && dateTo === endOfDayMs(last.getTime())) {
      return `Month: ${from.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}`
    }
  }
  if (dateFrom == null) return `Until: ${formatDate(dateTo)}`
  if (dateTo == null) return `From: ${formatDate(dateFrom)}`
  return `Dates: ${formatDate(dateFrom)} – ${formatDate(dateTo)}`
}
