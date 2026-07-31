import { useState } from 'react'
import { X, Copy, Check } from 'lucide-react'
import Sheet from '../ui/Sheet'

/**
 * How-to for the Android auto-fill. greuro can't read notifications itself
 * (no app should be able to, and iOS forbids it entirely) — instead an
 * automation app that DOES have notification access (Tasker / MacroDroid)
 * reads the Google Pay notification and hands greuro the amount, which opens
 * a prefilled transaction. This screen only lives in Settings.
 */
export default function AutofillGuide({ open, onClose }) {
  const base = `${window.location.origin}${import.meta.env.BASE_URL}`
  const example = `${base}?amount=%amount`
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(example)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard blocked — the user can select the text manually */
    }
  }

  return (
    <Sheet open={open} onClose={onClose} label="Auto-fill from notifications">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-txt-primary">Auto-fill (Android)</h2>
        <button
          onClick={onClose}
          className="rounded-full p-1.5 text-txt-secondary hover:bg-white/5"
          aria-label="Close"
        >
          <X size={20} />
        </button>
      </div>

      <p className="mb-4 text-sm leading-relaxed text-txt-secondary">
        greuro can’t read your notifications itself — apps aren’t allowed to. Instead, a small
        automation app that <em>does</em> have notification access (e.g.{' '}
        <span className="text-txt-primary">Tasker</span> or MacroDroid) reads the Google Pay
        notification and opens greuro with the amount already filled in.
      </p>

      <ol className="mb-4 space-y-3 text-sm text-txt-secondary">
        <li>
          <span className="font-semibold text-txt-primary">1.</span> Install greuro to your home
          screen (Settings → About → Install), and install Tasker.
        </li>
        <li>
          <span className="font-semibold text-txt-primary">2.</span> In Tasker, add a{' '}
          <span className="text-txt-primary">Profile → Event → UI → Notification</span>, owner app
          = Google Pay. Capture the amount into a variable (e.g. a regex like{' '}
          <code className="rounded bg-white/10 px-1">(\d+[.,]\d{2})</code> on the notification
          text).
        </li>
        <li>
          <span className="font-semibold text-txt-primary">3.</span> Add a Task action{' '}
          <span className="text-txt-primary">Net → Browse URL</span> with this URL (replace{' '}
          <code className="rounded bg-white/10 px-1">%amount</code> with your captured variable):
        </li>
      </ol>

      <div className="mb-4 flex items-center gap-2 rounded-xl border border-hairline bg-elevated p-2">
        <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap px-1 text-xs text-txt-primary">
          {example}
        </code>
        <button
          onClick={copy}
          className="flex shrink-0 items-center gap-1 rounded-lg bg-accent/15 px-2.5 py-1.5 text-xs font-semibold text-accent hover:bg-accent/25"
        >
          {copied ? <Check size={13} /> : <Copy size={13} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>

      <p className="mb-2 text-sm text-txt-secondary">
        Tapping the notification (or running the task) opens greuro straight to a new transaction
        with the amount filled — you just add the description and save.
      </p>
      <p className="text-xs leading-snug text-txt-muted">
        Alternatively, any app’s “Share” can send text to greuro (it’s registered as a share
        target) and greuro will pull the amount out. iPhone can’t read notifications, so this
        Android-only — nothing here affects the app on iOS.
      </p>
    </Sheet>
  )
}
