'use client'

// F086 (thin front) — the app says whether you are in, and lets you leave.
//
// The gap this closes, in Don's words: he could not tell whether he was signed
// in, and there was no way to sign out. Both live in the navigation, because
// that is the one thing present on every screen — the state has to be legible
// from wherever you happen to be, not only on one page.
//
// THE WORD IS "You". The nav tab and the route already use it, and
// role-language.md says the identity noun is lowercase and nearly invisible
// while direct address is "you". Not "account", not "profile" — neither
// appears anywhere in the app today and neither should start here.
//
// Deliberately NOT F086: the metro, the Pages you hold, and the seven dead
// reads on /you. This says who you are and gets you out; it does not become
// the surface F086 describes.

import { useState } from 'react'
import Link from 'next/link'
import { PersonMark } from './PersonMark'

interface Props {
  /** True until auth has resolved. Renders nothing rather than guessing. */
  loading: boolean
  /** Null when signed out. Empty string when signed in without a name set. */
  displayName: string | null
  handle?: string | null
  photoUrl?: string | null
  signOut: () => Promise<{ error: unknown }>
  onSignedOut?: () => void
}

export function YouBadge({
  loading,
  displayName,
  handle,
  photoUrl,
  signOut,
  onSignedOut,
}: Props) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // A badge that says "Sign in" for a moment to someone already signed in is
  // worse than one that waits, so this renders nothing until auth resolves.
  if (loading) return null

  if (displayName === null) {
    return (
      <Link
        href="/auth/login"
        data-testid="you-badge-signin"
        className="inline-flex min-h-11 items-center rounded-full px-3 text-sm font-medium text-[var(--color-charcoal-900)] hover:bg-neutral-100"
      >
        Sign in
      </Link>
    )
  }

  // Signed in, but the name may not be set: onboarding writes it, and a
  // person can reach this before finishing. Their handle is the next best
  // thing they chose themselves; "Signed in" is the last resort and is still
  // better than an empty badge that looks broken.
  const shown = displayName.trim() || handle?.trim() || 'Signed in'

  const out = async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    const { error: err } = await signOut()
    setBusy(false)
    if (err) {
      setError('That did not go through. Mind trying again?')
      return
    }
    onSignedOut?.()
  }

  return (
    <div data-testid="you-badge" className="flex items-center gap-2">
      <Link href="/you" className="flex min-h-11 items-center gap-2 rounded-full px-2 hover:bg-neutral-100">
        <PersonMark name={shown} photoUrl={photoUrl} />
        <span className="max-w-32 truncate text-sm font-medium text-[var(--color-charcoal-900)]">
          {shown}
        </span>
      </Link>
      <button
        type="button"
        onClick={out}
        disabled={busy}
        className="inline-flex min-h-11 items-center rounded-full px-3 text-sm text-neutral-600 underline hover:bg-neutral-100 disabled:opacity-50"
      >
        {busy ? 'Signing out…' : 'Sign out'}
      </button>
      {error && (
        <p role="alert" className="text-sm text-[var(--color-charcoal-900)]">
          {error}
        </p>
      )}
    </div>
  )
}
