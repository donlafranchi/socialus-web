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
//   3. WHAT THEY CAN DO — join the waitlist, which already exists end to end
//      (metro.waitlist_join, the counts, the standing popup). This is assembly.
//
// SIGNED OUT IS THE COMMON CASE HERE and the waitlist needs an account:
// `joinMetroWaitlistAction` calls `getUser()` and throws without one. So the
// control routes to sign-in rather than failing after the tap. Whether an
// anonymous person should be able to join at all is a real question and it is
// Don's — it needs a row that is not keyed to a member, which is schema, not
// assembly. Until then this is honest about the step rather than hiding it.
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
import { joinMetroWaitlistAction, type JoinMetroWaitlistResult } from '@/app/_actions/metro-waitlist-actions'
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
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [standing, setStanding] = useState<JoinMetroWaitlistResult | null>(null)
  const [joined, setJoined] = useState(false)

  const submit = async () => {
    if (!role || busy) return
    setBusy(true)
    setError(null)
    try {
      const result = await joinMetroWaitlistAction({ metroId: metro.id, role })
      setJoined(true)
      if (!result.open) setStanding(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not go through. Try again?')
    } finally {
      setBusy(false)
    }
  }

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
            <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
              You’ll need an account, so we count each person once.
            </p>
            <Link
              href={`/auth/login?next=${encodeURIComponent(`/explore?metro=${metro.slug}`)}`}
              data-testid="waitlist-signin"
              className="btn-primary mt-3 w-full"
            >
              Sign in to be counted
            </Link>
          </>
        ) : (
          <>
            <fieldset className="mt-2">
              <legend className="text-sm text-[var(--color-fg-muted)]">
                Which one are you?
              </legend>
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
            <button
              type="button"
              onClick={submit}
              disabled={!role || busy}
              data-testid="waitlist-join"
              className="btn-primary mt-3 w-full disabled:opacity-50"
            >
              {busy ? 'Adding you…' : 'Count me in'}
            </button>
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
          combined={standing.standing.combined}
          target={standing.standing.target}
          message={standing.message}
          onClose={() => setStanding(null)}
        />
      ) : null}
    </div>
  )
}
