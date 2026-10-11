import { Download, ShieldCheck } from 'lucide-react'
import { formatDate } from '../lib/format'
import Sheet from './ui/Sheet'

export default function BackupReminder({
  open,
  lastBackupAt,
  busy,
  error,
  downloaded,
  onBackup,
  onConfirmSaved,
  onDismiss,
}) {
  return (
    <Sheet open={open} onClose={onDismiss} label="Monthly backup reminder">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/15 text-accent">
        <ShieldCheck size={23} aria-hidden="true" />
      </div>
      <h2 className="text-xl font-semibold text-txt-primary">Back up your budget</h2>
      <p className="mt-2 text-sm leading-relaxed text-txt-secondary">
        Greuro saves your budget to your signed-in Supabase account. Download a JSON safety copy
        and save it somewhere separate so you can restore your budget if you ever need to.
      </p>
      {lastBackupAt != null && (
        <p className="mt-3 text-xs text-txt-muted">Last backup export: {formatDate(lastBackupAt)}</p>
      )}
      {downloaded && (
        <p className="mt-3 text-sm text-accent">
          The JSON file was downloaded. Save it somewhere outside this browser, then confirm below.
        </p>
      )}
      {error && <p role="alert" className="mt-3 text-sm text-expense">{error}</p>}
      <button
        type="button"
        onClick={onBackup}
        disabled={busy}
        className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-accent px-5 py-3 text-sm font-semibold text-black disabled:opacity-50"
      >
        <Download size={17} aria-hidden="true" />
        {busy ? 'Preparing backup…' : downloaded ? 'Download another copy' : 'Download JSON backup'}
      </button>
      {downloaded && (
        <button
          type="button"
          onClick={onConfirmSaved}
          disabled={busy}
          className="mt-2 w-full rounded-2xl border border-accent/40 px-5 py-3 text-sm font-semibold text-accent hover:bg-accent/10 disabled:opacity-50"
        >
          I saved it somewhere safe
        </button>
      )}
      <button
        type="button"
        onClick={onDismiss}
        disabled={busy}
        className="mt-2 w-full rounded-2xl px-5 py-3 text-sm font-medium text-txt-secondary hover:bg-white/5 disabled:opacity-50"
      >
        Remind me next month
      </button>
      <p className="mt-3 text-center text-xs leading-relaxed text-txt-muted">
        Keep at least one copy outside this browser. Greuro cannot recover a file kept only in site data.
      </p>
    </Sheet>
  )
}
