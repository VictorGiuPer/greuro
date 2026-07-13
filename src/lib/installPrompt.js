/**
 * PWA "install to home screen" support.
 *
 * Two very different worlds:
 *
 *   - Chromium (Android Chrome, desktop Chrome/Edge) fires `beforeinstallprompt`
 *     once the app meets the installability criteria. We preventDefault() it
 *     (suppressing Chrome's own mini-infobar) and stash the event so our own
 *     button can trigger the REAL native install dialog on demand.
 *
 *     The event fires early — usually before React has mounted — and only once.
 *     So the listener is registered here at module load (main.jsx imports this
 *     first), not inside a component effect, or we'd miss it entirely.
 *
 *   - iOS / iPadOS has NO programmatic install. Safari only offers
 *     Share → "Add to Home Screen", and third-party iOS browsers can't install
 *     at all. There we can only show instructions.
 */

let deferred = null
const listeners = new Set()

const emit = () => listeners.forEach((fn) => fn())

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferred = e
    emit()
  })
  window.addEventListener('appinstalled', () => {
    deferred = null // it can't be re-used
    emit()
  })
}

/** Subscribe to install-availability changes. Returns an unsubscribe fn. */
export function subscribe(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** True when the browser handed us a real, promptable install event. */
export function canPromptInstall() {
  return deferred !== null
}

/**
 * Show the native install dialog.
 * @returns {Promise<'accepted'|'dismissed'|'unavailable'>}
 */
export async function promptInstall() {
  if (!deferred) return 'unavailable'
  const event = deferred
  deferred = null // single-use; Chrome rejects a second prompt() on it
  emit()
  event.prompt()
  const { outcome } = await event.userChoice
  return outcome
}

/** Already running as an installed app (not a browser tab)? */
export function isStandalone() {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    window.navigator.standalone === true // iOS Safari's own flag
  )
}

/** iOS or iPadOS (which since 13 reports itself as a Mac, but has touch). */
export function isIOS() {
  if (typeof navigator === 'undefined') return false
  return (
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  )
}

/** On iOS, only Safari can add to the home screen — Chrome/Firefox/Edge can't. */
export function isIOSSafari() {
  return isIOS() && !/crios|fxios|edgios|opios/i.test(navigator.userAgent)
}
