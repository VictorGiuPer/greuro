/**
 * Ask the browser to mark our IndexedDB as persistent so it isn't evicted
 * under storage pressure or Safari's ITP 7-day timer. This matters most on
 * iOS home-screen PWAs; it's a best-effort request — not all browsers grant
 * (or even support) it, so failures are swallowed.
 *
 * @returns {Promise<boolean>} whether storage is now persisted
 */
export async function requestPersistentStorage() {
  try {
    if (!navigator.storage?.persist) return false
    // Already granted in a previous session? Don't re-prompt the engine.
    if (await navigator.storage.persisted()) return true
    return await navigator.storage.persist()
  } catch {
    return false
  }
}
