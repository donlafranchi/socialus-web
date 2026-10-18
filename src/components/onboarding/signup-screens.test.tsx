// F081 criteria 1 and 5 across every screen of signup, in order: the email, the password, the confirm-your-email
// stop, the phone code, the profile form, and the screen after it (open or waiting).

import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { COPY } from '@/lib/copy'
import { EmailFirstSignup, type EmailFirstDeps } from '@/components/auth/EmailFirstSignup'
import { OnboardingFlow, type OnboardingActions } from './OnboardingFlow'

afterEach(() => cleanup())

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({}) }))

const deps = (session: unknown): EmailFirstDeps => ({
  checkEmailRegistered: vi.fn(async () => false),
  signUp: vi.fn(async () => ({ data: { session }, error: null })),
  signInWithPassword: vi.fn(),
  signInWithOtp: vi.fn(),
  signInWithGoogle: vi.fn(),
})
const actions = (res: Awaited<ReturnType<OnboardingActions['completeOnboarding']>>): OnboardingActions => ({
  completeOnboarding: vi.fn(async () => res),
})
const OPEN = { ok: true as const, metro: { name: 'Sacramento' }, waiting: null }
const WAITING = { ok: true as const, metro: null, waiting: { metroId: 'm-yuba', name: 'Yuba County, CA' } }

/** The inputs a person can type into or tick, by what they are (a read-only copy kept for password managers is not one). */
function fields(root: HTMLElement) {
  return [...root.querySelectorAll('input, select, textarea')].filter((el) => !(el as HTMLInputElement).readOnly).map((el) => {
    const i = el as HTMLInputElement
    return i.type === 'checkbox' || i.type === 'radio' ? `${i.type}` : i.type === 'email' ? 'email' : i.id || i.name || i.type
  })
}

async function emailScreens(session: unknown) {
  const d = deps(session)
  const onAuthenticated = vi.fn()
  const view = render(<EmailFirstSignup next="/onboarding" onAuthenticated={onAuthenticated} deps={d} />)
  const seen: { name: string; root: HTMLElement; fields: string[]; text: string }[] = []
  const snap = (name: string) => seen.push({ name, root: view.container, fields: fields(view.container), text: view.container.textContent ?? '' })
  snap('email')
  fireEvent.change(screen.getByTestId('email-input'), { target: { value: 'maya@example.test' } })
  fireEvent.click(screen.getByTestId('submit-button'))
  await screen.findByTestId('set-password-heading')
  snap('password')
  fireEvent.change(screen.getByTestId('password-input'), { target: { value: 'supersecret' } })
  fireEvent.click(screen.getByTestId('submit-button'))
  await waitFor(() => expect(d.signUp).toHaveBeenCalledWith('maya@example.test', 'supersecret', '/onboarding'))
  if (!session) {
    await screen.findByTestId('confirm-email-message')
    snap('confirm email')
  }
  cleanup()
  return { seen, onAuthenticated }
}

async function onboardingScreens(res: typeof OPEN | typeof WAITING) {
  const a = actions(res)
  const seen: { name: string; fields: string[]; text: string }[] = []
  const phone = render(
    <OnboardingFlow actions={a} onNavigate={vi.fn()} phoneVerified={false} phoneAuth={{ sendCode: vi.fn(async () => ({ ok: true as const })), verifyCode: vi.fn(async () => ({ ok: true as const })) }} />,
  )
  seen.push({ name: 'phone', fields: fields(phone.container), text: phone.container.textContent ?? '' })
  fireEvent.change(screen.getByLabelText(/phone number/i), { target: { value: '9165550134' } })
  fireEvent.click(screen.getByRole('button', { name: /text me a code/i }))
  await screen.findByLabelText(/code/i)
  seen.push({ name: 'code', fields: fields(phone.container), text: phone.container.textContent ?? '' })
  fireEvent.change(screen.getByLabelText(/code/i), { target: { value: '123456' } })
  fireEvent.click(screen.getByRole('button', { name: /verify/i }))
  const form = await screen.findByTestId('onboarding-form')
  seen.push({ name: 'profile', fields: fields(form), text: phone.container.textContent ?? '' })
  fireEvent.change(screen.getByTestId('onboarding-legal-name'), { target: { value: 'Maya Rivera' } })
  fireEvent.change(screen.getByTestId('onboarding-name'), { target: { value: 'Maya' } })
  fireEvent.change(screen.getByTestId('onboarding-zip'), { target: { value: '95819' } })
  const box = screen.getByTestId('onboarding-adult') as HTMLInputElement
  const label = screen.getByTestId('onboarding-adult-label')
  const boxStartedUnticked = !box.checked
  fireEvent.click(box)
  fireEvent.click(screen.getByTestId('onboarding-continue'))
  await screen.findByTestId(res.metro ? 'onboarding-metro' : 'waitlist-market')
  seen.push({ name: res.metro ? 'open' : 'waiting', fields: fields(phone.container), text: phone.container.textContent ?? '' })
  cleanup()
  return { seen, a, label, boxStartedUnticked }
}

describe('F081.1 — signup collects four fields and the 18+/Terms box, and verifies the email', () => {
  // [guards F081.1 partial: "every member is verified as a person" — the phone step is built and checked here, but switched off by PHONE_VERIFICATION_REQUIRED until the keys in #707; that production requires email confirmation is a Supabase dashboard setting (read 2026-10-18: on), outside the repo]
  it('asks for the email, then legal name, display name and zip with an unticked 18+ box beside the Terms; goes no further until the email is confirmed; asks nothing else', async () => {
    // The email, then a password for the login. With no session (confirmation on), it stops and asks the person to confirm.
    const unconfirmed = await emailScreens(null)
    expect(unconfirmed.seen.map((s) => [s.name, s.fields])).toEqual([
      ['email', ['email']],
      ['password', ['password']],
      ['confirm email', []],
    ])
    expect(unconfirmed.seen[2]!.text).toMatch(/confirm/i)
    expect(unconfirmed.onAuthenticated).not.toHaveBeenCalled()
    // Once confirmed, the login has a session and signup carries on.
    const confirmed = await emailScreens({ user: { id: 'u1' } })
    expect(confirmed.onAuthenticated).toHaveBeenCalledWith('/onboarding')

    // The person check (a texted code), then the four-field form, then where the zip put them.
    const { seen, a, label, boxStartedUnticked } = await onboardingScreens(OPEN)
    expect(seen.map((s) => [s.name, s.fields])).toEqual([
      ['phone', ['phone-number']],
      ['code', ['phone-code']],
      ['profile', ['onboarding-legal-name', 'onboarding-name', 'onboarding-zip', 'checkbox']],
      ['open', []],
    ])
    expect(boxStartedUnticked).toBe(true)
    expect(label.textContent?.replace(/’/g, "'").replace(/\s+/g, ' ').trim()).toBe("I'm 18 or older and agree to the Terms")
    expect(within(label).getByRole('link', { name: 'Terms' })).toHaveAttribute('href', '/terms')
    expect(a.completeOnboarding).toHaveBeenCalledWith({ legalName: 'Maya Rivera', displayName: 'Maya', zip: '95819', adultConfirmed: true })
  })
})

// The family of lines F081.5 forbids: anything promising not to sell member information.
const NEVER_SELL = /\b(never|not|don['’]?t|do not|won['’]?t|will not)\s+(ever\s+)?(sell|share|rent|trade)\b|\bsell(ing)?\s+(your|member|personal)\b/i

describe('F081.5 — the signup screen says what the app is for, and nothing about not selling member information', () => {
  // [guards F081.5]
  it('the line is on the account and profile screens, word for word, and no signup screen carries a never-sell line', async () => {
    const email = await emailScreens(null)
    const open = await onboardingScreens(OPEN)
    const waiting = await onboardingScreens(WAITING)
    const screens = [...email.seen, ...open.seen, ...waiting.seen]
    expect(screens.filter((s) => s.text.includes(COPY.signupLine)).map((s) => s.name)).toEqual(['password', 'profile', 'profile'])
    expect(screens.filter((s) => NEVER_SELL.test(s.text)).map((s) => s.name)).toEqual([])
    expect(NEVER_SELL.test(COPY.signupLine)).toBe(false)
  })

  it('the pattern sees a never-sell line', () => {
    for (const line of ['We never sell your information.', 'We don’t sell your data', 'We do not share member data', 'Selling your data is not our model'])
      expect(NEVER_SELL.test(line)).toBe(true)
  })
})
