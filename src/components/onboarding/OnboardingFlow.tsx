// T089 — Newcomer onboarding (F030). One field, one button.
// The display name is the only thing we ask for; the home locality is
// defaulted server-side by completeOnboardingAction.
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { completeOnboardingAction, type SaveProfileInput } from '@/app/onboarding/actions'
import { joinMetroWaitlistAction } from '@/app/_actions/metro-waitlist-actions'
import { MetroWaitlistStep, type MetroOption } from '@/components/metro/MetroWaitlistStep'
import { PhoneVerifyStep, type PhoneAuth } from './PhoneVerifyStep'
import { AuthCard } from '@/components/shell/AuthCard'

export interface OnboardingActions {
  completeOnboarding: (
    input: SaveProfileInput,
  ) => Promise<{ ok: true } | { ok: false; field: 'displayName'; message: string }>
}

const DEFAULT_ACTIONS: OnboardingActions = { completeOnboarding: completeOnboardingAction }

export function OnboardingFlow({
  initialDisplayName = '',
  actions = DEFAULT_ACTIONS,
  onNavigate,
  metros = [],
  onJoinWaitlist = joinMetroWaitlistAction,
  phoneVerified = true,
  phoneAuth,
}: {
  initialDisplayName?: string
  actions?: OnboardingActions
  onNavigate?: (url: string) => void
  /** T163 (F076) — every US metro, selectable. An empty list is an error the
   *  step reports, never a reason to skip it. */
  metros?: MetroOption[]
  onJoinWaitlist?: typeof joinMetroWaitlistAction
  /** F081 — false sends the member through the text-message code first. */
  phoneVerified?: boolean
  phoneAuth?: PhoneAuth
}) {
  const router = useRouter()
  const navigate = onNavigate ?? ((url: string) => router.push(url))

  const [displayName, setDisplayName] = useState(initialDisplayName)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // T163 — the metro step follows the name, rather than sharing a screen with
  // it: the name is one field and one button, and keeping it that way is the
  // reason this flow reads as it does.
  const [askMetro, setAskMetro] = useState(false)
  const [phoneDone, setPhoneDone] = useState(phoneVerified)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    const name = displayName.trim()
    if (!name) {
      setError('Add your name.')
      return
    }
    setError(null)
    setBusy(true)
    try {
      const res = await actions.completeOnboarding({ displayName: name })
      if (!res.ok) {
        setError(res.message)
        return
      }
      // Unconditional, per Don's ruling 2026-09-14: the metro step appears for
      // every signup. It previously ran only when the metro list was non-empty,
      // which meant a failed or empty query SKIPPED the question silently — the
      // person would never be asked, never join a waitlist, and F076 criteria 1
      // and 2 would fail with nothing to show for it. An empty list is now an
      // error the step itself reports, not a reason to walk past it.
      setAskMetro(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Try again.')
    } finally {
      setBusy(false)
    }
  }

  if (!phoneDone) {
    return <PhoneVerifyStep auth={phoneAuth} onVerified={() => setPhoneDone(true)} />
  }

  if (askMetro) {
    return (
      <AuthCard>
        <div className="space-y-4">
          <div className="space-y-1">
            <h1 className="text-title-1 text-[var(--color-fg)]">Where are you, and why?</h1>
            <p className="text-body-sm text-[var(--color-fg-muted)]">
              We are not everywhere yet. Tell us where you are and we will tell you where it stands.
            </p>
          </div>
          <MetroWaitlistStep
            metros={metros}
            onJoin={onJoinWaitlist}
            onDone={() => navigate('/')}
          />
        </div>
      </AuthCard>
    )
  }

  return (
    <AuthCard>
      <form data-testid="onboarding-form" onSubmit={submit} className="space-y-4">
        <div className="space-y-1">
          <h1 className="text-title-1 text-[var(--color-fg)]">What should we call you?</h1>
          <p className="text-body-sm text-[var(--color-fg-muted)]">This is the name your neighbors will see.</p>
        </div>

        <div className="space-y-2">
          <label htmlFor="onboarding-name" className="sr-only">
            Your name
          </label>
          <input
            id="onboarding-name"
            data-testid="onboarding-name"
            className="input"
            placeholder="Your name"
            autoFocus
            maxLength={60}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'onboarding-name-error' : undefined}
            value={displayName}
            onChange={(e) => {
              setDisplayName(e.target.value)
              setError(null)
            }}
          />
          {error && (
            <p
              id="onboarding-name-error"
              data-testid="onboarding-error"
              role="alert"
              className="text-body-sm text-[var(--color-danger,#b00)]"
            >
              {error}
            </p>
          )}
        </div>

        <button
          type="submit"
          data-testid="onboarding-continue"
          disabled={busy}
          className="btn-primary inline-flex w-full items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-75"
        >
          {busy && <Loader2 data-testid="onboarding-spinner" className="h-4 w-4 animate-spin" />}
          Continue
        </button>
      </form>
    </AuthCard>
  )
}
