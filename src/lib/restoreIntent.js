const RESTORE_INTENT_KEY = 'greuro:restore-json-intent'

export function hasPendingJsonRestore() {
  try {
    return window.localStorage.getItem(RESTORE_INTENT_KEY) === '1'
  } catch {
    return false
  }
}

export function setPendingJsonRestore(pending) {
  try {
    if (pending) window.localStorage.setItem(RESTORE_INTENT_KEY, '1')
    else window.localStorage.removeItem(RESTORE_INTENT_KEY)
  } catch {
    // Restoring remains usable when storage is unavailable; persistence only
    // helps Android resume the route after the system file picker returns.
  }
}
