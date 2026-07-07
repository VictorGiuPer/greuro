import { useEffect, useState } from 'react'

/**
 * Quiet, non-blocking toast. Give it a `message` (or null); it fades itself
 * out after ~3.5s. Used e.g. for "3 scheduled transactions added".
 */
export default function Toast({ message, onDone }) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!message) return
    setVisible(true)
    const hide = setTimeout(() => setVisible(false), 3500)
    const done = setTimeout(() => onDone?.(), 3900)
    return () => {
      clearTimeout(hide)
      clearTimeout(done)
    }
  }, [message, onDone])

  if (!message) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className={`pointer-events-none fixed left-1/2 top-4 z-[70] -translate-x-1/2 transition-all duration-300 ${
        visible ? 'translate-y-0 opacity-100' : '-translate-y-2 opacity-0'
      }`}
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <div className="rounded-full border border-hairline bg-elevated px-4 py-2 text-sm font-medium text-txt-primary shadow-lg">
        {message}
      </div>
    </div>
  )
}
