// Shared by the browser and MCP. All amounts that affect funding use cents.
import { cents, money, savingsPool, goalProgress, excluded } from './savings.js'
import { effectiveAmount } from './txAmount.js'
import { addDays, addMonthsClamped } from './dates.js'

export const budgetTables = ['accounts', 'categories', 'transactions', 'scheduled', 'settings', 'goals', 'trips']
const fail = (message, code = 'INVALID_ACTION', details = {}) => { const e = new Error(message); e.code = code; e.details = details; throw e }
const find = (data, table, id) => data[table].find((r) => r.id === Number(id)) || fail(`${table}: record ${id} does not exist.`)
const positive = (value) => { if (!Number.isFinite(Number(value)) || cents(value) <= 0) fail('Enter an amount greater than zero.'); return money(cents(value)) }
const nextId = (rows) => Math.max(0, ...rows.map((r) => Number(r.id) || 0)) + 1
const goalFor = (data, id) => { const g = find(data, 'goals', id); if (g.modelVersion !== 2) fail('Review this legacy goal before using it.'); return g }
const changeEarmark = (goal, delta) => { if (!goal.archived) goal.earmarked = money(cents(goal.earmarked) + delta) }

export function applyReleases(data, releases = []) {
  for (const release of releases) {
    const goal = goalFor(data, release.goalId)
    const amount = cents(positive(release.amount))
    if (goal.archived || amount > cents(goal.earmarked)) fail('Release exceeds the goal’s reserved money.')
    changeEarmark(goal, -amount)
  }
}

export function ensureCoverage(before, after, allowShortfall = false) {
  const old = cents(savingsPool(before).shortfall), current = cents(savingsPool(after).shortfall)
  if (!allowShortfall && current > old && after.goals.some((g) => !g.archived && cents(g.earmarked) > 0)) {
    fail('Release reserved money to save this change.', 'RELEASE_REQUIRED', { ...savingsPool(after), goals: after.goals.filter((g) => !g.archived && g.modelVersion === 2 && cents(g.earmarked) > 0) })
  }
}

function updateRefunds(data, purchase, oldRefunds = []) {
  let remaining = cents(purchase.fundedAmount)
  let refundable = cents(effectiveAmount(purchase))
  for (const refund of data.transactions.filter((r) => r.refundOfTransactionId === purchase.id).sort((a, b) => a.id - b.id)) {
    const old = oldRefunds.find((r) => r.id === refund.id)
    if (cents(refund.amount) > refundable) fail('Refunds cannot exceed the purchase’s effective amount.')
    const restored = Math.min(remaining, cents(refund.amount))
    const goal = goalFor(data, purchase.goalId)
    if (!purchase.fundingClosed) changeEarmark(goal, restored - cents(old?.fundingRestored))
    refund.goalId = purchase.goalId; refund.fundingRestored = money(restored)
    remaining -= restored; refundable -= cents(refund.amount)
  }
}

function transactionWrite(data, input, action, now) {
  const old = action === 'add' ? null : { ...find(data, 'transactions', input.id) }
  if (old?.type === 'expense' && data.transactions.some((t) => t.refundOfTransactionId === old.id) && action === 'delete') fail('Remove linked refunds before deleting this purchase.')
  const oldRefunds = old?.type === 'expense' ? data.transactions.filter((r) => r.refundOfTransactionId === old.id).map((r) => ({ ...r })) : []
  if (old?.goalId && old.type === 'expense' && !old.fundingClosed) {
    const oldGoal = goalFor(data, old.goalId)
    changeEarmark(oldGoal, cents(old.fundedAmount) - oldRefunds.reduce((s, r) => s + cents(r.fundingRestored), 0))
  }
  if (old?.refundOfTransactionId && !find(data, 'transactions', old.refundOfTransactionId).fundingClosed) changeEarmark(goalFor(data, old.goalId), -cents(old.fundingRestored))
  if (action === 'delete') {
    data.transactions = data.transactions.filter((t) => t.id !== old.id)
    if (old.refundOfTransactionId) updateRefunds(data, find(data, 'transactions', old.refundOfTransactionId), data.transactions.filter((r) => r.refundOfTransactionId === old.refundOfTransactionId))
    return { deleted: true, id: old.id }
  }
  const supplied = input.fields || input
  const tx = { ...old, ...supplied, id: old?.id ?? nextId(data.transactions), amount: positive(supplied.amount ?? old?.amount), createdAt: old?.createdAt ?? now, updatedAt: now }
  delete tx.releases; delete tx.allowShortfall; delete tx.historical; delete tx.confirm
  if (!['income', 'expense', 'transfer'].includes(tx.type) || !Number.isFinite(tx.date) || tx.date < 0 || tx.date > 8640000000000000) fail('A transaction needs a valid type and date.')
  tx.description = String(tx.description ?? '').trim()
  for (const flag of ['reimbursable', 'resolved', 'isAdjustment']) {
    if (tx[flag] != null && ![0, 1, false, true].includes(tx[flag])) fail(`Invalid ${flag} flag.`)
    tx[flag] = tx[flag] ? 1 : 0
  }
  tx.owedAmount = Number(tx.owedAmount || 0)
  if (!Number.isFinite(tx.owedAmount) || tx.owedAmount < 0 || tx.owedAmount > tx.amount) fail('Amount owed must be between zero and the transaction total.')
  if (tx.type !== 'expense') { tx.reimbursable = 0; tx.resolved = 0; tx.owedAmount = 0; tx.paidBackNote = null }
  if (tx.type === 'transfer') {
    find(data, 'accounts', tx.fromAccountId); find(data, 'accounts', tx.toAccountId)
    if (tx.fromAccountId === tx.toAccountId) fail('Transfer accounts must differ.')
    tx.accountId = null; tx.categoryId = null; tx.goalId = null
  } else {
    find(data, 'accounts', tx.accountId)
    if (!tx.isAdjustment && tx.categoryId == null) fail('Choose a category matching the transaction type.')
  }
  if (tx.categoryId != null) {
    const category = find(data, 'categories', tx.categoryId)
    if (category.kind !== tx.type) fail('Category must match transaction type.')
  }
  if (tx.tripId) find(data, 'trips', tx.tripId)
  if (action === 'add' && !Object.hasOwn(supplied, 'goalId') && tx.type === 'expense') tx.goalId = data.trips.find((t) => t.id === tx.tripId)?.goalId ?? null
  tx.goalId = tx.goalId ? Number(tx.goalId) : null
  tx.refundOfTransactionId = tx.refundOfTransactionId ? Number(tx.refundOfTransactionId) : null
  tx.fundedAmount = 0; tx.fundingRestored = 0
  if (tx.type === 'expense' && tx.goalId) {
    if (excluded(tx, data)) fail('Balance-only transactions cannot fund goals.')
    const goal = goalFor(data, tx.goalId)
    if (goal.archived && (!old || old.goalId !== tx.goalId)) fail('Reopen this goal before adding purchases.')
    tx.historicalFunding = input.historical === true || (old?.historicalFunding && old.goalId === tx.goalId) ? 1 : 0
    // A description/date edit must not consume a later top-up. Only a change
    // in effective purchase value changes its original reservation usage.
    const sameGoal = old?.type === 'expense' && old.goalId === tx.goalId
    tx.fundingClosed = sameGoal && old.fundingClosed ? 1 : 0
    const requested = tx.fundingClosed ? Math.min(cents(old.fundedAmount), cents(effectiveAmount(tx))) : tx.historicalFunding ? 0 : sameGoal
      ? Math.max(0, Math.min(cents(effectiveAmount(tx)), cents(old.fundedAmount) + cents(effectiveAmount(tx)) - cents(effectiveAmount(old))))
      : cents(effectiveAmount(tx))
    const used = goal.archived || tx.fundingClosed ? requested : Math.min(requested, cents(goal.earmarked))
    tx.fundedAmount = money(used)
    if (!tx.fundingClosed) changeEarmark(goal, -used)
  } else if (!tx.refundOfTransactionId) tx.goalId = null
  if (tx.refundOfTransactionId) {
    if (tx.type !== 'income' || tx.isAdjustment) fail('A refund must be an income transaction.')
    const purchase = find(data, 'transactions', tx.refundOfTransactionId)
    if (purchase.type !== 'expense' || !purchase.goalId) fail('Choose a goal-funded purchase to refund.')
    tx.goalId = purchase.goalId
  }
  if (old) data.transactions[data.transactions.findIndex((t) => t.id === old.id)] = tx
  else data.transactions.push(tx)
  if (oldRefunds.length) {
    if (tx.type !== 'expense' || tx.goalId !== old.goalId) fail('Remove linked refunds before reassigning this purchase.')
    updateRefunds(data, tx, [])
  }
  if (tx.refundOfTransactionId) {
    const existing = data.transactions.filter((r) => r.refundOfTransactionId === tx.refundOfTransactionId && r.id !== tx.id).map((r) => ({ ...r }))
    updateRefunds(data, find(data, 'transactions', tx.refundOfTransactionId), existing)
  }
  return tx
}

export function finishGroup(data, goalId, now, reopen = false) {
  const goal = goalFor(data, goalId)
  const trips = data.trips.filter((t) => t.goalId === goal.id)
  const released = Number(goal.earmarked) || 0
  if (!reopen) for (const tx of data.transactions) if (tx.type === 'expense' && tx.goalId === goal.id) tx.fundingClosed = 1
  goal.archived = reopen ? 0 : 1; goal.earmarked = 0; goal.updatedAt = now
  for (const trip of trips) { trip.archived = goal.archived; trip.updatedAt = now }
  return { goal, trips, released }
}

export function validateSavings(data) {
  const reviewed = data.goals.some((g) => g.modelVersion === 2)
  for (const goal of data.goals) {
    if (goal.modelVersion === 2 && (!Number.isFinite(goal.earmarked) || cents(goal.earmarked) < 0 || (goal.archived && cents(goal.earmarked) !== 0))) fail('Invalid goal reservation.')
  }
  for (const trip of data.trips) if (trip.goalId) find(data, 'goals', trip.goalId)
  for (const tx of data.transactions) {
    if (reviewed) {
      if (tx.type === 'transfer') { find(data, 'accounts', tx.fromAccountId); find(data, 'accounts', tx.toAccountId) }
      else {
        find(data, 'accounts', tx.accountId)
        if (tx.categoryId != null && find(data, 'categories', tx.categoryId).kind !== tx.type) fail('Category must match the transaction type.')
      }
      if (tx.tripId) find(data, 'trips', tx.tripId)
      if (tx.goalId && excluded(tx, data)) fail('Balance-only transactions cannot fund goals.')
    }
    if (tx.goalId) goalFor(data, tx.goalId)
    if (tx.fundedAmount != null && (cents(tx.fundedAmount) < 0 || cents(tx.fundedAmount) > cents(effectiveAmount(tx)))) fail('Invalid purchase funding.')
    if (tx.refundOfTransactionId) {
      const purchase = find(data, 'transactions', tx.refundOfTransactionId)
      if (purchase.goalId !== tx.goalId || purchase.type !== 'expense' || tx.type !== 'income') fail('Invalid refund link.')
      if (cents(tx.fundingRestored) < 0 || cents(tx.fundingRestored) > cents(tx.amount)) fail('Invalid restored funding.')
    }
    if (tx.type === 'expense') {
      const refunds = data.transactions.filter((r) => r.refundOfTransactionId === tx.id)
      if (refunds.reduce((s, r) => s + cents(r.amount), 0) > cents(effectiveAmount(tx)) || refunds.reduce((s, r) => s + cents(r.fundingRestored), 0) > cents(tx.fundedAmount)) fail('Refund exceeds the purchase or its original funding.')
    }
  }
  if (reviewed) for (const item of data.scheduled) {
    if (item.type === 'transfer') { find(data, 'accounts', item.fromAccountId); find(data, 'accounts', item.toAccountId) }
    else find(data, 'accounts', item.accountId)
    if (item.categoryId) find(data, 'categories', item.categoryId)
    if (item.tripId) find(data, 'trips', item.tripId)
    if (item.goalId) goalFor(data, item.goalId)
  }
}

/** Returns a new complete budget and result; never mutates the input snapshot. */
export function applyBudgetAction(before, action, input = {}, options = {}) {
  const data = structuredClone(before)
  for (const table of budgetTables) data[table] ||= []
  const now = options.now ?? Date.now()
  let result
  applyReleases(data, input.releases)
  if (action.startsWith('transaction.')) {
    const kind = action.split('.')[1]
    result = kind === 'batch' ? input.transactions.map((tx) => transactionWrite(data, tx, 'add', now)) : transactionWrite(data, input, kind, now)
  } else if (action === 'scheduled.post') {
    const posted = []
    for (const item of data.scheduled.filter((s) => s.active !== 0 && s.nextDueDate <= (input.asOf ?? now)).sort((a, b) => a.nextDueDate - b.nextDueDate || a.id - b.id)) {
      let guard = 0
      while (item.nextDueDate <= (input.asOf ?? now)) {
        if (++guard > 1200) fail('Too many overdue occurrences; review this schedule.')
        const fields = Object.fromEntries(['type', 'amount', 'accountId', 'categoryId', 'fromAccountId', 'toAccountId', 'tripId', 'goalId'].filter((key) => Object.hasOwn(item, key)).map((key) => [key, item[key]]))
        posted.push(transactionWrite(data, { ...fields, date: item.nextDueDate, description: item.description || '' }, 'add', now))
        item.lastPostedDate = item.nextDueDate
        const { unit, interval } = item.recurrence
        const next = unit === 'day' || unit === 'week' ? addDays(item.nextDueDate, interval * (unit === 'week' ? 7 : 1)) : addMonthsClamped(item.nextDueDate, interval * (unit === 'year' ? 12 : 1), item.anchorDay)
        if (next <= item.nextDueDate) fail('Schedule must advance its due date.')
        item.nextDueDate = next; item.updatedAt = now
      }
    }
    result = posted
  } else if (action === 'goal.reserve' || action === 'goal.release' || action === 'goal.review') {
    const goal = find(data, 'goals', input.id)
    const amount = action === 'goal.review' && cents(input.amount) === 0 ? 0 : cents(positive(input.amount))
    if (action === 'goal.review') {
      if (goal.modelVersion === 2) fail('This goal was already reviewed.')
      goal.modelVersion = 2; goal.earmarked = goal.archived ? 0 : money(amount)
    } else {
      goalFor(data, goal.id)
      if (goal.archived) fail('Reopen this goal first.')
      if (action === 'goal.release' && amount > cents(goal.earmarked)) fail('Release exceeds the reserved amount.')
      changeEarmark(goal, action === 'goal.release' ? -amount : amount)
    }
    goal.updatedAt = now; result = goal
  } else if (action === 'goal.finish' || action === 'goal.reopen') {
    if (!input.confirm) fail('Confirm the affected goal and trips first.')
    result = finishGroup(data, input.id, now, action === 'goal.reopen')
  } else if (action === 'trip.assign') {
    const trip = find(data, 'trips', input.id)
    if (!input.confirm) fail('Confirm the selected historical purchases first.')
    const goal = input.goalId ? goalFor(data, input.goalId) : null
    trip.goalId = goal?.id ?? null; trip.updatedAt = now
    for (const id of [...new Set(input.transactionIds || [])]) {
      const tx = find(data, 'transactions', id)
      if (tx.tripId !== trip.id || tx.type !== 'expense' || excluded(tx, data)) fail('Select an eligible expense from this trip.')
      if (tx.goalId && tx.goalId !== goal?.id && !input.confirmReassign) fail('Confirm reassignment from the existing goal.')
      if (tx.goalId === goal?.id) continue
      transactionWrite(data, { id, fields: { goalId: goal?.id ?? null }, historical: true }, 'update', now)
    }
    result = trip
  } else if (action === 'pool.resolve') {
    if (cents(savingsPool(data).shortfall) > 0) fail('Release enough to cover the shortfall.')
    result = savingsPool(data)
  } else if (action === 'account.balance') {
    const account = find(data, 'accounts', input.id)
    if (!Number.isFinite(Number(input.balance))) fail('Enter a valid balance.')
    const current = poolBalance(data, account.id)
    const delta = cents(input.balance) - cents(current)
    result = delta ? transactionWrite(data, { type: delta > 0 ? 'income' : 'expense', amount: money(Math.abs(delta)), accountId: account.id, date: now, categoryId: null, isAdjustment: 1, description: 'Balance adjustment' }, 'add', now) : { changed: false }
  } else if (action === 'settings.set') {
    for (const [key, value] of Object.entries(input.values || {})) {
      const existing = data.settings.find((r) => r.key === key)
      if (existing) existing.value = value; else data.settings.push({ key, value })
    }
    result = data.settings
  } else {
    const [entity, operation] = action.split('.')
    const table = { goal: 'goals', trip: 'trips', account: 'accounts', category: 'categories', scheduled: 'scheduled' }[entity]
    if (!table || !['add', 'update', 'delete'].includes(operation)) fail('Unknown budget action.')
    const old = operation === 'add' ? null : find(data, table, input.id)
    if (operation === 'delete') {
      if (entity === 'goal' && data.transactions.some((t) => t.goalId === old.id)) fail('Archive goals with spending history instead of deleting them.')
      if (entity === 'goal' && data.trips.some((t) => t.goalId === old.id)) fail('Unlink trips before deleting this goal.')
      if (entity === 'goal' && cents(old.earmarked) > 0 && !input.confirm) fail('Confirm releasing this goal’s money.')
      if (entity === 'account' && [...data.transactions, ...data.scheduled].some((t) => [t.accountId, t.fromAccountId, t.toAccountId].includes(old.id))) fail('This account has transaction history or scheduled payments.')
      if (entity === 'category' && [...data.transactions, ...data.scheduled].some((t) => t.categoryId === old.id)) fail('This category has transaction history or scheduled payments.')
      data[table] = data[table].filter((r) => r.id !== old.id)
      if (entity === 'trip') for (const tx of data.transactions) if (tx.tripId === old.id) tx.tripId = null
      result = { deleted: true, id: old.id }
    } else {
      const fields = input.fields || input
      if (['id', 'createdAt', 'updatedAt', 'earmarked', 'modelVersion', 'fundedAmount'].some((k) => Object.hasOwn(fields, k))) fail('Use dedicated financial actions for protected fields.')
      const row = { ...old, ...fields, id: old?.id ?? nextId(data[table]), createdAt: old?.createdAt ?? now, updatedAt: now }
      delete row.confirm; delete row.releases
      if (entity !== 'scheduled' && !String(row.name || '').trim()) fail('A name is required.')
      if (entity === 'goal') { row.targetAmount = positive(row.targetAmount); if (!old) { row.modelVersion = 2; row.earmarked = 0; row.archived = 0 } }
      if (entity === 'trip' && (!Number.isInteger(row.days) || row.days < 1)) fail('Trip length must be a positive number of days.')
      if (entity === 'category' && !['income', 'expense'].includes(row.kind)) fail('Choose income or expense for the category.')
      if (entity === 'account') {
        row.type ||= 'asset'; row.usage ||= 'active'; row.startingBalance = Number(row.startingBalance || 0); row.expectedAnnualReturn = Number(row.expectedAnnualReturn || 0)
        if (!['asset', 'liability'].includes(row.type) || !['active', 'investment'].includes(row.usage) || !Number.isFinite(row.startingBalance) || !Number.isFinite(row.expectedAnnualReturn)) fail('Invalid account settings.')
      }
      if (entity === 'scheduled') {
        row.amount = positive(row.amount); row.active = row.active === 0 ? 0 : 1
        if (!['income', 'expense', 'transfer'].includes(row.type) || !Number.isFinite(row.nextDueDate) || !['day', 'week', 'month', 'year'].includes(row.recurrence?.unit) || !Number.isInteger(row.recurrence?.interval) || row.recurrence.interval < 1) fail('Invalid scheduled payment.')
        row.anchorDay ||= new Date(row.nextDueDate).getDate(); row.startDate ||= row.nextDueDate; row.lastPostedDate ??= null
        if (row.type === 'transfer') { find(data, 'accounts', row.fromAccountId); find(data, 'accounts', row.toAccountId); if (row.fromAccountId === row.toAccountId) fail('Transfer accounts must differ.') }
        else find(data, 'accounts', row.accountId)
        if (row.categoryId) find(data, 'categories', row.categoryId)
        if (row.goalId) goalFor(data, row.goalId)
        if (row.tripId) find(data, 'trips', row.tripId)
      }
      if (old) data[table][data[table].findIndex((r) => r.id === old.id)] = row; else data[table].push(row)
      if (entity === 'trip' && Boolean(row.archived) !== Boolean(old?.archived) && row.goalId) {
        if (!input.confirm) fail('Confirm finishing/reopening the linked goal and trips.')
        finishGroup(data, row.goalId, now, !row.archived)
      }
      result = row
    }
  }
  validateSavings(data)
  ensureCoverage(before, data, options.allowShortfall)
  const pending = data.settings.find((s) => s.key === 'savingsResolutionRequired')
  const value = savingsPool(data).shortfall > 0 && savingsPool(data).earmarked > 0
  if (pending) pending.value = value
  else if (value) data.settings.push({ key: 'savingsResolutionRequired', value })
  return { data, result, pool: savingsPool(data) }
}

import { balancesFor } from './savings.js'
function poolBalance(data, id) { return balancesFor(data).get(id) || 0 }
