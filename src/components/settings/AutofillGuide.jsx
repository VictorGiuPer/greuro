import { useState } from 'react'
import { X, Copy, Check } from 'lucide-react'
import Sheet from '../ui/Sheet'

/**
 * How-to for the Android auto-fill. greuro can't read notifications itself
 * (no app should be able to, and iOS forbids it entirely) — instead ANY
 * automation app with notification access reads the Google Pay notification
 * and hands greuro the amount via a URL, which opens a prefilled transaction.
 * Deliberately app-agnostic: greuro only cares that a URL gets opened, not
 * what opened it — MacroDroid, Automate and Tasker all work identically.
 * This screen only lives in Settings.
 */
const APPS = [
  {
    name: 'MacroDroid',
    free: 'Free',
    trigger: 'Trigger → Notification → Received, select Google Pay',
    action: 'Action → Connectivity → Open Link (URL)',
  },
  {
    name: 'Automate',
    free: 'Free',
    trigger: 'Block → Notification → Google Pay',
    action: 'Block → Interface → Browse URL',
  },
  {
    name: 'Tasker',
    free: '~€3.50 one-time',
    trigger: 'Profile → Event → UI → Notification, owner app = Google Pay',
    action: 'Task action → Net → Browse URL',
  },
]

export default function AutofillGuide({ open, onClose }) {
  const base = `${window.location.origin}${import.meta.env.BASE_URL}`
  const example = `${base}?amount=%amount`
  const [copied, setCopied] = useState(false)
  const [appIdx, setAppIdx] = useState(0)
  const app = APPS[appIdx]

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
        automation app that <em>does</em> have notification access reads the Google Pay
        notification and opens greuro with the amount already filled in. Any of these work — pick
        the one you already have, or a free one:
      </p>

      {/* App picker */}
      <div className="mb-4 flex gap-2">
        {APPS.map((a, i) => (
          <button
            key={a.name}
            type="button"
            onClick={() => setAppIdx(i)}
            aria-pressed={i === appIdx}
            className={`flex-1 rounded-xl border px-2 py-2 text-center transition-colors ${
              i === appIdx
                ? 'border-accent/60 bg-accent/15 text-accent'
                : 'border-hairline bg-elevated text-txt-secondary'
            }`}
          >
            <div className="text-sm font-semibold">{a.name}</div>
            <div className="text-[11px] opacity-70">{a.free}</div>
          </button>
        ))}
      </div>

      <ol className="mb-4 space-y-3 text-sm text-txt-secondary">
        <li>
          <span className="font-semibold text-txt-primary">1.</span> Install greuro to your home
          screen (Settings → About → Install), and install {app.name}.
        </li>
        <li>
          <span className="font-semibold text-txt-primary">2.</span> Add a notification trigger:{' '}
          <span className="text-txt-primary">{app.trigger}</span>. Capture the amount into a
          variable — a regex like{' '}
          <code className="rounded bg-white/10 px-1">(\d+[.,]\d{2})</code> on the notification
          text works in all three apps.
        </li>
        <li>
          <span className="font-semibold text-txt-primary">3.</span>{' '}
          <span className="text-txt-primary">{app.action}</span> with this URL (replace{' '}
          <code className="rounded bg-white/10 px-1">%amount</code> with your captured variable —
          each app has its own variable syntax):
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
        Running the automation opens greuro straight to a new transaction with the amount filled —
        you just add the description and save.
      </p>
      <p className="text-xs leading-snug text-txt-muted">
        Any app that can open a URL or share text works — the exact menu names above vary by
        app version, but the concept (notification → regex → open URL) is the same everywhere.
        Alternatively, any app’s “Share” can send text to greuro directly (it’s registered as a
        share target) and greuro will pull the amount out of it. iPhone can’t read notifications
        at all, so this is Android-only — nothing here affects the app on iOS.
      </p>
    </Sheet>
  )
}
