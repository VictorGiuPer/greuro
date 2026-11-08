import { evaluate } from './calc'
import { outstandingAmount } from './txAmount'

export const owedName = (note) => String(note ?? '').trim().replace(/\s+/g, ' ')
export const owedKey = (note) => owedName(note).toLowerCase()
export const isOwedEntry = (tx) => tx.type === 'expense' && Boolean(tx.reimbursable)

// Every percentage is a share of the transaction total, even in expressions.
export function evaluateOwed(input, total) {
  const raw = String(input ?? '')
  if (!raw.includes('%')) return evaluate(raw)
  if (!Number.isFinite(total) || total <= 0) {
    return { value: null, error: 'Enter a valid transaction total first.', incomplete: false }
  }
  const expanded = raw.replace(/(\d[\d.,]*)\s*%/g, (_, number) => {
    const parsed = evaluate(number)
    return parsed.error ? `${number}%` : `(${number}*${total}/100)`
  })
  return evaluate(expanded)
}

export function groupOwedTransactions(rows) {
  const groups = new Map()
  for (const tx of [...rows].sort((a, b) => b.date - a.date || b.id - a.id)) {
    if (!isOwedEntry(tx)) continue
    const key = owedKey(tx.paidBackNote)
    if (!groups.has(key)) groups.set(key, {
      key, name: owedName(tx.paidBackNote) || 'Unspecified',
      transactions: [], totalCents: 0, outstandingCents: 0, resolvedCents: 0,
    })
    const group = groups.get(key)
    const cents = Math.round(Math.max(0, Number(tx.owedAmount) || 0) * 100)
    group.transactions.push(tx)
    group.totalCents += cents
    group.outstandingCents += Math.round(outstandingAmount(tx) * 100)
    if (tx.resolved) group.resolvedCents += cents
  }
  return [...groups.values()].map((g) => ({
    ...g, total: g.totalCents / 100, outstanding: g.outstandingCents / 100,
    resolved: g.resolvedCents / 100,
  })).sort((a, b) => a.name.localeCompare(b.name) || a.key.localeCompare(b.key))
}
