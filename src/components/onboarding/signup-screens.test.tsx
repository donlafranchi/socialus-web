// F081 criteria 1 and 5 across every screen of the live signup, in order: the email, the emailed 6-digit code,
// the profile form, and the screen after it (open or waiting). The password screen at /auth/password is retired
// (builder accounts only) and is not walked here.

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { COPY } from '@/lib/copy'
import { SignInForm } from '@/components/auth/SignInForm'
import { OnboardingFlow, type OnboardingActions } from './OnboardingFlow'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
const auth = vi.hoisted(() => ({ signInWithOtp: vi.fn(), verifyEmailCode: vi.fn() }))
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => auth }))

const assign = vi.fn()
beforeEach(() => {
  localStorage.clear()
  auth.signInWithOtp.mockResolvedValue({ error: null })
  auth.verifyEmailCode.mockResolvedValue({ error: null })
  Object.defineProperty(window, 'location', { configurable: true, value: { ...window.location, assign } })
})
const actions = (res: Awaited<ReturnType<OnboardingActions['completeOnboarding']>>): OnboardingActions => ({
  completeOnboarding: vi.fn(async () => res),
})
const OPEN = { ok: true as const, metro: { name: 'Sacramento' }, waiting: null }
const WAITING = { ok: true as const, metro: null, waiting: { metroId: 'm-yuba', name: 'Yuba County, CA', town: null } }

/** The inputs a person can type into or tick, by what they are (a read-only copy kept for password managers is not one). */
function fields(root: HTMLElement) {
  return [...root.querySelectorAll('input, select, textarea')].filter((el) => !(el as HTMLInputElement).readOnly).map((el) => {
    const i = el as HTMLInputElement
    return i.type === 'checkbox' || i.type === 'radio' ? `${i.type}` : i.type === 'email' ? 'email' : i.id || i.name || i.type
  })
}

/** The live way in (the PM, 2026-10-18): the email, then the emailed 6-digit code. Signing in creates the account when the email is new. */
async function liveScreens() {
  const seen: { name: string; fields: string[]; text: string }[] = []
  const view = render(<SignInForm next="/onboarding" />)
  const snap = (name: string) => seen.push({ name, fields: fields(view.container), text: view.container.textContent ?? '' })
  snap('email')
  fireEvent.change(screen.getByTestId('email-input'), { target: { value: 'maya@example.test' } })
  fireEvent.click(screen.getByTestId('submit-button'))
  await screen.findByTestId('code-sent')
  expect(auth.signInWithOtp).toHaveBeenCalledWith('maya@example.test', '/onboarding')
  snap('code')
  fireEvent.change(screen.getByTestId('code-input'), { target: { value: '123456' } })
  await waitFor(() => expect(auth.verifyEmailCode).toHaveBeenCalledWith('maya@example.test', '123456'))
  await waitFor(() => expect(assign).toHaveBeenCalledWith('/onboarding'))
  cleanup()
  return seen
}

async function onboardingScreens(res: typeof OPEN | typeof WAITING) {
  const a = actions(res)
  const seen: { name: string; fields: string[]; text: string }[] = []
  const phone = render(<OnboardingFlow actions={a} onNavigate={vi.fn()} />)
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

describe('F081.1 — signup collects four fields and the 18+ box, and verifies the email', () => {
  // [guards F081.1 partial: the phone step waits on #707 — "every member is verified as a person" is built but switched off by PHONE_VERIFICATION_REQUIRED until its keys; that production requires email confirmation is a Supabase dashboard setting, outside the repo]
  it('asks for the email, then its emailed code, then legal name, display name and zip with an unticked 18+ box beside the Terms; asks nothing else', async () => {
    const live = await liveScreens()
    expect(live.map((s) => [s.name, s.fields])).toEqual([
      ['email', ['email']],
      ['code', ['email-code']],
    ])
    const { seen, a, label, boxStartedUnticked } = await onboardingScreens(OPEN)
    expect(seen.map((s) => [s.name, s.fields])).toEqual([
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
  it('the line is on the profile screen, word for word, and no screen of the live path carries a never-sell line', async () => {
    const live = await liveScreens()
    const open = await onboardingScreens(OPEN)
    const waiting = await onboardingScreens(WAITING)
    const screens = [...live, ...open.seen, ...waiting.seen]
    expect(screens.filter((s) => s.text.includes(COPY.signupLine)).map((s) => s.name)).toEqual(['profile', 'profile'])
    expect(screens.filter((s) => NEVER_SELL.test(s.text)).map((s) => s.name)).toEqual([])
    expect(NEVER_SELL.test(COPY.signupLine)).toBe(false)
  })

  it('the pattern sees a never-sell line', () => {
    for (const line of ['We never sell your information.', 'We don’t sell your data', 'We do not share member data', 'Selling your data is not our model'])
      expect(NEVER_SELL.test(line)).toBe(true)
  })
})
