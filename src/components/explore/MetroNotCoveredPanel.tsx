'use client'

// What a person sees when they pick a metro SocialUs does not run in yet.
//
// It replaces a dead end. The scope sheet listed 295 unopened metros and made
// them untappable, which was honest about scope but told someone who found
// their own city nothing at all — not what is missing, not what would change
// it, not what the thing even looks like.
//
// Three parts, in the order they answer the questions actually being asked:
//
//   1. WHERE THIS STANDS — plainly, by name. No date, no queue position, no
//      progress bar. F076 forbids implying a schedule and nothing here implies
//      one.
//   2. WHAT IT LOOKS LIKE — the example block. This is the whole reason a
//      signed-out stranger has any reason to care, and it is the block Don
//      ruled on: marked, separated, non-interactive, captioned as the idea
//      rather than as stock.
//   3. WHAT THEY CAN DO — leave an address, or sign in. This is assembly.
//
// SIGNED OUT IS THE COMMON CASE HERE, and it used to be a dead end: the
// waitlist needed an account, so the control routed to /auth/login, which is
// the step someone who just found their own city has no reason to take yet.
// Don ruled that open on 2026-09-21 (F076 criteria 13-15) and T167 built the
// handler, so the signed-out branch now takes an address instead.
//
// THE POPUP CARRIES NO NUMBER ON THIS PATH, ruled 2026-09-22 (#196). A unique
// index on an email makes "is this address already waiting?" answerable, and
// any truthful live count leaks that by differencing — reading it before the
// write does not help, which the database said and the mock did not. So
// `joinMetroWaitlistAnonymousAction` returns no count and the dialog is given
// none. A signed-in member still sees theirs; they are entitled to see
// themselves counted.
//
// The session is read HERE rather than threaded down. Browse resolves auth
// server-side now (T156), but this panel is reached from inside the scope
// sheet — several client layers below the surface — and threading a flag
// through them to reach one button would couple the whole picker to it.

import { useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/hooks/useAuth'
import { ExampleBlock } from '@/components/cards'
import { MetroStandingDialog } from '@/components/metro/MetroStandingDialog'
import {
  joinMetroWaitlistAction,
  joinMetroWaitlistAnonymousAction,
  type JoinMetroWaitlistResult,
} from '@/app/_actions/metro-waitlist-actions'
import type { FeedMetro } from '@/lib/feed/feed-metro'

type Role = 'creator' | 'patron'

// The member-facing words. "Creator" and "patron" are internal shorthand and
// never appear in front of anyone.
const ROLE_LABELS: Record<Role, string> = {
  creator: 'I make or sell something here',
  patron: 'I’m looking for what’s nearby',
}

export function MetroNotCoveredPanel({
  metro,
  onBack,
}: {
  metro: FeedMetro
  onBack: () => void
}) {
  const { user } = useAuth()
  const signedIn = Boolean(user)
  const [role, setRole] = useState<Role | ''>('')
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // `combined`/`target` are absent on the anonymous path, which is what makes
  // the dialog render no number. See #196.
  const [standing, setStanding] = useState<
    { metroName: string; message: string; combined?: number; target?: number } | null
  >(null)
  const [joined, setJoined] = useState(false)

  const ready = Boolean(role) && (signedIn || email.trim().length > 0)

  const submit = async () => {
    if (!ready || !role || busy) return
    setBusy(true)
    setError(null)
    try {
      if (signedIn) {
        const result: JoinMetroWaitlistResult = await joinMetroWaitlistAction({
          metroId: metro.id,
          role,
        })
        setJoined(true)
        if (!result.open) {
          setStanding({
            metroName: result.metroName,
            message: result.message,
            combined: result.standing.combined,
            target: result.standing.target,
          })
        }
      } else {
        const result = await joinMetroWaitlistAnonymousAction({
          metroId: metro.id,
          email: email.trim(),
          role,
        })
        setJoined(true)
        // No combined, no target — deliberately. Spreading the result here
        // would be the bug, so the two fields are named rather than splatted.
        if (!result.open) {
          setStanding({ metroName: result.metroName, message: result.message })
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not go through. Try again?')
    } finally {
      setBusy(false)
    }
  }

  const roleRadios = (
    <fieldset className="mt-2">
      <legend className="text-sm text-[var(--color-fg-muted)]">Which one are you?</legend>
      <div className="mt-2 flex flex-col gap-2">
        {(Object.keys(ROLE_LABELS) as Role[]).map((r) => (
          <label key={r} className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="waitlist-role"
              value={r}
              checked={role === r}
              onChange={() => setRole(r)}
              data-testid={`waitlist-role-${r}`}
            />
            {ROLE_LABELS[r]}
          </label>
        ))}
      </div>
    </fieldset>
  )

  const submitButton = (
    <button
      type="button"
      onClick={submit}
      disabled={!ready || busy}
      data-testid="waitlist-join"
      className="btn-primary mt-3 w-full disabled:opacity-50"
    >
      {busy ? 'Adding you…' : 'Count me in'}
    </button>
  )

  return (
    <div data-testid="metro-not-covered" className="flex flex-col gap-5">
      <div>
        <button
          type="button"
          onClick={onBack}
          className="press text-sm text-[var(--color-fg-muted)] underline"
        >
          ← All areas
        </button>
        <h2 className="mt-2 text-lg font-semibold text-[var(--color-fg)]">
          SocialUs isn’t running in {metro.name} yet
        </h2>
        {/* No date, no queue position, no progress bar — F076 criterion 3. */}
        <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
          You can’t browse here yet. Telling us you’re here is what decides where it opens next.
        </p>
      </div>

      {/* Its own bounded block, outside any results region. Nothing on this
          screen is a real listing, which is itself the safest case — but the
          block is separated and captioned regardless, because the rule is about
          what a person reads, not about what happens to be on screen today. */}
      <ExampleBlock placeName={metro.name} />

      <div className="rounded-2xl bg-[var(--color-surface)] p-4">
        <h3 className="text-sm font-semibold text-[var(--color-fg)]">Tell us you’re here</h3>

        {joined ? (
          <p data-testid="waitlist-joined" className="mt-2 text-sm text-[var(--color-fg)]">
            Done — you’re counted in {metro.name}.
          </p>
        ) : !signedIn ? (
          <>
            {roleRadios}

            <label
              htmlFor="waitlist-email"
              className="mt-4 block text-sm text-[var(--color-fg-muted)]"
            >
              Where should we reach you?
            </label>
            <input
              id="waitlist-email"
              data-testid="waitlist-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="mt-1 w-full rounded-xl border border-[var(--color-charcoal-100)] px-3 py-2 text-sm"
            />
            {/* Criterion 15, said before they type rather than after. */}
            <p
              data-testid="waitlist-email-purpose"
              className="mt-2 text-xs text-[var(--color-fg-muted)]"
            >
              One message, if this metro opens. That is the only thing this address is used
              for — nothing else, ever.
            </p>

            {submitButton}

            {/* Signing up stays available, and is not the price of being told. */}
            <p className="mt-3 text-center text-xs text-[var(--color-fg-muted)]">
              <Link
                href={`/auth/login?next=${encodeURIComponent(`/explore?metro=${metro.slug}`)}`}
                data-testid="waitlist-signin-alt"
                className="underline"
              >
                Or sign in, if you already have an account
              </Link>
            </p>
          </>
        ) : (
          <>
            {roleRadios}
            {submitButton}
          </>
        )}

        {error ? (
          <p role="alert" className="mt-2 text-sm text-[var(--color-fg)]">
            {error}
          </p>
        ) : null}
      </div>

      {standing ? (
        <MetroStandingDialog
          metroName={standing.metroName}
          combined={standing.combined}
          target={standing.target}
          message={standing.message}
          onClose={() => setStanding(null)}
        />
      ) : null}
    </div>
  )
}
