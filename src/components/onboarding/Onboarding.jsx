import { useState } from 'react'
import { ArrowLeft, Wallet, FileJson, FileSpreadsheet, Sprout, ChevronRight } from 'lucide-react'
import { addAccount, seedIfEmpty } from '../../db'
import AccountForm from '../settings/AccountForm'
import ImportJson from '../settings/ImportJson'
import BlueCoinsImport from '../settings/BlueCoinsImport'

/**
 * First-run flow (only when the database is completely empty): create the
 * first account, restore a JSON backup, migrate from BlueCoins, or load
 * sample data to explore. Calls onComplete() once any path succeeds.
 */
export default function Onboarding({ onComplete }) {
  const [view, setView] = useState('menu') // menu | account
  const [importView, setImportView] = useState(null) // null | 'json' | 'bluecoins'
  const [busy, setBusy] = useState(false)
  const [imported, setImported] = useState(false)

  async function createFirstAccount(data) {
    await addAccount(data)
    await onComplete()
  }

  async function loadSample() {
    setBusy(true)
    try {
      await seedIfEmpty()
      await onComplete()
    } finally {
      setBusy(false)
    }
  }

  // Import overlays report success via onImported; complete when they close.
  async function handleImportClosed() {
    setImportView(null)
    if (imported) await onComplete()
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col bg-bg px-6 pb-10 text-txt-primary">
      {view === 'menu' ? (
        <>
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <img src={`${import.meta.env.BASE_URL}logo.png`} alt="" aria-hidden="true" className="mb-5 h-20 w-20" />
            <h1 className="mb-2 text-2xl font-bold">Welcome to greuro</h1>
            <p className="max-w-[280px] text-sm leading-relaxed text-txt-secondary">
              Grow your euros — private, offline budgeting. Everything stays on this device: no
              account, no cloud.
            </p>
          </div>

          <div className="space-y-3">
            <OptionCard
              icon={Wallet}
              title="Create my first account"
              desc="Start fresh with a checking or savings account"
              onClick={() => setView('account')}
              primary
            />
            <OptionCard
              icon={FileSpreadsheet}
              title="Import from BlueCoins"
              desc="Bring your history over (CSV / XLSX export)"
              onClick={() => setImportView('bluecoins')}
            />
            <OptionCard
              icon={FileJson}
              title="Restore a JSON backup"
              desc="From this app's own backup file"
              onClick={() => setImportView('json')}
            />
            <OptionCard
              icon={Sprout}
              title="Explore with sample data"
              desc="Look around first — wipe it later in Settings"
              onClick={loadSample}
              disabled={busy}
            />
          </div>
        </>
      ) : (
        <div className="pt-6">
          <button
            onClick={() => setView('menu')}
            aria-label="Back"
            className="mb-4 flex items-center gap-1.5 text-sm text-txt-secondary hover:text-txt-primary"
          >
            <ArrowLeft size={17} />
            Back
          </button>
          <h1 className="mb-1 text-xl font-bold">Your first account</h1>
          <p className="mb-5 text-sm text-txt-secondary">
            Where your money lives — e.g. "Checking". You can add more later in Settings.
          </p>
          <AccountForm onSubmit={createFirstAccount} onCancel={() => setView('menu')} />
        </div>
      )}

      <ImportJson
        open={importView === 'json'}
        onClose={handleImportClosed}
        onImported={() => setImported(true)}
      />
      <BlueCoinsImport
        open={importView === 'bluecoins'}
        onClose={handleImportClosed}
        onImported={() => setImported(true)}
      />
    </div>
  )
}

function OptionCard({ icon: Icon, title, desc, onClick, primary, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex w-full items-center gap-3.5 rounded-card border p-4 text-left transition-colors active:bg-white/[0.04] disabled:opacity-50 ${
        primary ? 'border-accent/50 bg-accent/10' : 'border-hairline bg-card'
      }`}
    >
      <Icon size={22} className={primary ? 'text-accent' : 'text-txt-secondary'} />
      <span className="min-w-0 flex-1">
        <span className={`block font-semibold ${primary ? 'text-accent' : 'text-txt-primary'}`}>
          {title}
        </span>
        <span className="block text-xs text-txt-muted">{desc}</span>
      </span>
      <ChevronRight size={18} className="shrink-0 text-txt-muted" />
    </button>
  )
}
