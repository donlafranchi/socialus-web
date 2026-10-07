// T089 → #222 (F081) — the signup screen, one screen: legal name, zip, display
// name, and the 18+ box with the Terms beside it (the email is the login, given
// already). The zip decides the metro and the next screen shows which one; nobody
// picks a metro here. All copy is a placeholder ([public-is-draft]).
'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { completeOnboardingAction, type SaveProfileInput, type SaveProfileResult } from '@/app/onboarding/actions'
import { joinMetroWaitlistAction } from '@/app/_actions/metro-waitlist-actions'
import { MetroWaitlistStep, type MetroOption } from '@/components/metro/MetroWaitlistStep'
import { PhoneVerifyStep, type PhoneAuth } from './PhoneVerifyStep'
import { AuthCard } from '@/components/shell/AuthCard'
import { COPY } from '@/lib/copy'
import { validateSignupProfile, type SignupProfileField } from '@/lib/signup/profile'

export interface OnboardingActions {
  completeOnboarding: (input: SaveProfileInput) => Promise<SaveProfileResult>
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
  /** T163 (F076) — every US metro, for the waitlist step a zip with no metro goes to. */
  metros?: MetroOption[]
  onJoinWaitlist?: typeof joinMetroWaitlistAction
  /** F081 — false sends the member through the text-message code first. */
  phoneVerified?: boolean
  phoneAuth?: PhoneAuth
}) {
  const router = useRouter()
  const navigate = onNavigate ?? ((url: string) => router.push(url))

  const [legalName, setLegalName] = useState('')
  const [displayName, setDisplayName] = useState(initialDisplayName)
  const [zip, setZip] = useState('')
  const [adult, setAdult] = useState(false)
  const [error, setError] = useState<{ field: SignupProfileField; message: string } | null>(null)
  const [busy, setBusy] = useState(false)
  // After the profile lands: the metro the zip decided (shown), or null (the
  // waitlist question, because we are not in that zip's metro yet).
  const [metroName, setMetroName] = useState<string | null | undefined>(undefined)
  const [phoneDone, setPhoneDone] = useState(phoneVerified)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    const input = { legalName, displayName, zip, adultConfirmed: adult }
    const checked = validateSignupProfile(input)
    if (!checked.ok) {
      setError({ field: checked.field, message: checked.message })
      return
    }
    setError(null)
    setBusy(true)
    try {
      const res = await actions.completeOnboarding(checked.value)
      if (!res.ok) {
        setError({ field: res.field, message: res.message })
        return
      }
      setMetroName(res.metro?.name ?? null)
    } catch (err) {
      setError({ field: 'displayName', message: err instanceof Error ? err.message : 'Something went wrong. Try again.' })
    } finally {
      setBusy(false)
    }
  }

  if (!phoneDone) {
    return <PhoneVerifyStep auth={phoneAuth} onVerified={() => setPhoneDone(true)} />
  }

  if (typeof metroName === 'string') {
    return (
      <AuthCard>
        <div className="space-y-4" data-testid="onboarding-metro">
          <h1 className="text-title-1 text-[var(--color-fg)]">You’re in {metroName}</h1>
          <p className="text-body-sm text-[var(--color-fg-muted)]">Your zip code decided this. You can change it any time from your account.</p>
          <button type="button" data-testid="onboarding-metro-continue" onClick={() => navigate('/')} className="btn-primary w-full">
            Continue
          </button>
        </div>
      </AuthCard>
    )
  }

  if (metroName === null) {
    return (
      <AuthCard>
        <div className="space-y-4">
          <div className="space-y-1">
            <h1 className="text-title-1 text-[var(--color-fg)]">Where are you, and why?</h1>
            <p className="text-body-sm text-[var(--color-fg-muted)]">
              We are not everywhere yet. Tell us where you are and we will tell you where it stands.
            </p>
          </div>
          <MetroWaitlistStep metros={metros} onJoin={onJoinWaitlist} onDone={() => navigate('/')} />
        </div>
      </AuthCard>
    )
  }

  const bad = (f: SignupProfileField) => (error?.field === f ? true : undefined)
  return (
    <AuthCard>
      <form data-testid="onboarding-form" onSubmit={submit} noValidate className="space-y-4">
        <div className="space-y-1">
          <h1 className="text-title-1 text-[var(--color-fg)]">Tell us who you are</h1>
          <p data-testid="signup-line" className="text-body-sm text-[var(--color-fg-muted)]">
            {COPY.signupLine}
          </p>
        </div>

        <div className="space-y-3">
          <div>
            <label htmlFor="onboarding-legal-name" className="text-body-sm text-[var(--color-fg)]">
              Legal name
            </label>
            <input
              id="onboarding-legal-name"
              data-testid="onboarding-legal-name"
              className="input"
              autoComplete="name"
              maxLength={120}
              aria-invalid={bad('legalName')}
              value={legalName}
              onChange={(e) => setLegalName(e.target.value)}
            />
            <p className="mt-1 text-caption text-[var(--color-fg-muted)]">Only our team sees this.</p>
          </div>
          <div>
            <label htmlFor="onboarding-name" className="text-body-sm text-[var(--color-fg)]">
              Display name
            </label>
            <input
              id="onboarding-name"
              data-testid="onboarding-name"
              className="input"
              maxLength={60}
              aria-invalid={bad('displayName')}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
            <p className="mt-1 text-caption text-[var(--color-fg-muted)]">This is the name your neighbors will see.</p>
          </div>
          <div>
            <label htmlFor="onboarding-zip" className="text-body-sm text-[var(--color-fg)]">
              Zip code
            </label>
            <input
              id="onboarding-zip"
              data-testid="onboarding-zip"
              className="input"
              inputMode="numeric"
              autoComplete="postal-code"
              maxLength={5}
              aria-invalid={bad('zip')}
              value={zip}
              onChange={(e) => setZip(e.target.value)}
            />
            <p className="mt-1 text-caption text-[var(--color-fg-muted)]">It decides your metro. It is never shown to anyone.</p>
          </div>

          <label data-testid="onboarding-adult-label" className="flex min-h-11 items-start gap-3 text-body-sm text-[var(--color-fg)]">
            <input
              type="checkbox"
              data-testid="onboarding-adult"
              className="mt-1 h-5 w-5 shrink-0"
              aria-invalid={bad('adultConfirmed')}
              checked={adult}
              onChange={(e) => setAdult(e.target.checked)}
            />
            <span>
              I’m 18 or older and agree to the{' '}
              <Link href="/terms" className="underline" target="_blank">
                Terms
              </Link>
            </span>
          </label>

          {error && (
            <p data-testid="onboarding-error" role="alert" className="text-body-sm text-[var(--color-danger,#b00)]">
              {error.message}
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
