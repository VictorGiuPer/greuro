import { useEffect, useState } from 'react'
import { Download, Share, SquarePlus, X, Check } from 'lucide-react'
import {
  subscribe,
  canPromptInstall,
  promptInstall,
  isStandalone,
  isIOS,
  isIOSSafari,
} from '../lib/installPrompt'
import Sheet from './ui/Sheet'

/**
 * "Install app" button — adds greuro to the phone's home screen.
 *
 * Chromium (Android/desktop) gets the real one-tap native install dialog.
 * iOS can't be prompted programmatically, so it opens a short Share →
 * "Add to Home Screen" guide instead. The button hides itself entirely when
 * the app is already installed, or in a browser that can't install at all —
 * no dead buttons.
 */
export default function InstallAppButton({ variant = 'card' }) {
  const [promptable, setPromptable] = useState(canPromptInstall)
  // Latches once the browser has ever offered an install event. The event is
  // single-use: if the user DISMISSES the native dialog, Chrome won't fire it
  // again this session, so without this the button would vanish and leave them
  // no way back. We keep it and fall back to the written instructions.
  const [everPromptable, setEverPromptable] = useState(canPromptInstall)
  const [installed, setInstalled] = useState(isStandalone)
  const [guideOpen, setGuideOpen] = useState(false)
  const [done, setDone] = useState(false)

  // beforeinstallprompt usually lands a moment AFTER mount, so react to it.
  useEffect(
    () =>
      subscribe(() => {
        const now = canPromptInstall()
        setPromptable(now)
        if (now) setEverPromptable(true)
      }),
    [],
  )

  useEffect(() => {
    const onInstalled = () => setInstalled(true)
    window.addEventListener('appinstalled', onInstalled)
    return () => window.removeEventListener('appinstalled', onInstalled)
  }, [])

  const ios = isIOS()

  async function handleClick() {
    if (promptable) {
      const outcome = await promptInstall()
      if (outcome === 'accepted') setDone(true)
      // Dismissed (or the event went stale): the native dialog is spent, so
      // the next tap falls through to the instructions below.
      else if (outcome === 'unavailable') setGuideOpen(true)
      return
    }
    setGuideOpen(true) // iOS, or after a dismissed prompt: manual only
  }

  // Checked BEFORE `installed`: accepting the install fires `appinstalled`,
  // which would otherwise hide this component instantly and leave the tap with
  // no feedback at all. Confirm first; it's gone on the next load anyway.
  if (done) {
    return (
      <p className="flex items-center justify-center gap-2 py-2 text-sm font-medium text-accent">
        <Check size={16} />
        Installed. Open greuro from your home screen.
      </p>
    )
  }

  // Already an app, or a browser with no install path (e.g. desktop Firefox).
  if (installed || (!promptable && !everPromptable && !ios)) return null

  const label = 'Install app'
  const sub = 'Add greuro to your home screen'

  return (
    <>
      {variant === 'card' ? (
        <button
          type="button"
          onClick={handleClick}
          className="flex w-full items-center gap-3.5 rounded-card border border-hairline bg-card p-4 text-left transition-colors active:bg-white/[0.04]"
        >
          <Download size={22} className="shrink-0 text-accent" />
          <span className="min-w-0 flex-1">
            <span className="block font-semibold text-txt-primary">{label}</span>
            <span className="block text-xs text-txt-muted">{sub}</span>
          </span>
        </button>
      ) : (
        <button
          type="button"
          onClick={handleClick}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-accent/50 bg-accent/10 py-3 text-sm font-semibold text-accent transition-opacity active:opacity-80"
        >
          <Download size={17} />
          {label}
        </button>
      )}

      <Sheet open={guideOpen} onClose={() => setGuideOpen(false)} label="Install greuro">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-txt-primary">Add to Home Screen</h2>
          <button
            onClick={() => setGuideOpen(false)}
            className="rounded-full p-1.5 text-txt-secondary hover:bg-white/5"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        {ios ? (
          <>
            {!isIOSSafari() && (
              <p className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-300">
                On iPhone and iPad only <strong>Safari</strong> can install apps. Open this page in
                Safari, then follow the steps below.
              </p>
            )}
            <ol className="space-y-3">
              <GuideStep n={1} icon={Share}>
                Tap the <strong className="text-txt-primary">Share</strong> button in Safari&apos;s
                toolbar (the square with an arrow).
              </GuideStep>
              <GuideStep n={2} icon={SquarePlus}>
                Scroll down and choose{' '}
                <strong className="text-txt-primary">Add to Home Screen</strong>.
              </GuideStep>
              <GuideStep n={3} icon={Check}>
                Tap <strong className="text-txt-primary">Add</strong>. greuro now opens full-screen,
                offline, like a native app.
              </GuideStep>
            </ol>
          </>
        ) : (
          <ol className="space-y-3">
            <GuideStep n={1} icon={Download}>
              Open your browser&apos;s menu (the <strong className="text-txt-primary">⋮</strong> or
              share icon).
            </GuideStep>
            <GuideStep n={2} icon={SquarePlus}>
              Choose <strong className="text-txt-primary">Install app</strong> or{' '}
              <strong className="text-txt-primary">Add to Home screen</strong>.
            </GuideStep>
          </ol>
        )}

        <p className="mt-5 text-xs leading-snug text-txt-muted">
          Installing only adds an icon. Your data stays on this device either way.
        </p>
      </Sheet>
    </>
  )
}

function GuideStep({ n, icon: Icon, children }) {
  return (
    <li className="flex items-start gap-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-tile border border-hairline bg-elevated text-accent">
        <Icon size={16} />
      </span>
      <span className="pt-1 text-sm leading-snug text-txt-secondary">
        <strong className="text-txt-muted">{n}.</strong> {children}
      </span>
    </li>
  )
}
