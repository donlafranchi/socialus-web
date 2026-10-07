import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react'
import { COPY } from '@/lib/copy'
import '@testing-library/jest-dom/vitest'
import { OnboardingFlow, type OnboardingActions } from './OnboardingFlow'

// T089 → #222 — onboarding is the F081 signup screen. Real DB writes are the F030 eval's job.

afterEach(() => cleanup())

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

function makeActions(over: Partial<OnboardingActions> = {}): OnboardingActions {
  return {
    completeOnboarding: vi.fn(async () => ({ ok: true as const, metro: { name: 'Sacramento-Roseville, CA' } })),
    ...over,
  }
}

const continueBtn = () => screen.getByTestId('onboarding-continue')

function fill({ legal = 'Maya Rivera', display = 'Maya', zip = '95819', adult = true } = {}) {
  fireEvent.change(screen.getByTestId('onboarding-legal-name'), { target: { value: legal } })
  fireEvent.change(screen.getByTestId('onboarding-name'), { target: { value: display } })
  fireEvent.change(screen.getByTestId('onboarding-zip'), { target: { value: zip } })
  if (adult) fireEvent.click(screen.getByTestId('onboarding-adult'))
}

// #222 (F081) — one screen: legal name, zip, display name, and the 18+ box with
// the Terms beside it. The email is the login, already given.
describe('F081 — the signup screen', () => {
  it('asks for exactly the fields F081 names, and the 18+ box', () => {
    render(<OnboardingFlow actions={makeActions()} onNavigate={vi.fn()} />)
    for (const id of ['onboarding-legal-name', 'onboarding-name', 'onboarding-zip', 'onboarding-adult']) {
      expect(screen.getByTestId(id)).toBeInTheDocument()
    }
    expect(screen.getByTestId('onboarding-form').querySelectorAll('input')).toHaveLength(4)
  })

  it('the 18+ box starts unticked and has the Terms link beside it', () => {
    render(<OnboardingFlow actions={makeActions()} onNavigate={vi.fn()} />)
    const box = screen.getByTestId('onboarding-adult') as HTMLInputElement
    expect(box.checked).toBe(false)
    const label = screen.getByTestId('onboarding-adult-label')
    expect(label).toHaveTextContent(/18 or older/i)
    expect(within(label).getByRole('link', { name: /terms/i })).toHaveAttribute('href', '/terms')
  })

  it('says what the app is for, and never asks whether the person makes or finds', () => {
    render(<OnboardingFlow actions={makeActions()} onNavigate={vi.fn()} />)
    expect(screen.getByTestId('signup-line')).toHaveTextContent(COPY.signupLine)
    expect(document.body.textContent).not.toMatch(/make or find|make things|find things|here to make|here to find/i)
  })

  it('sends the trimmed fields and the confirmation to the action', async () => {
    const actions = makeActions()
    render(<OnboardingFlow actions={actions} onNavigate={vi.fn()} />)
    fill({ legal: '  Maya Rivera ', display: '  Maya  ', zip: ' 95819 ' })
    fireEvent.click(continueBtn())
    await waitFor(() =>
      expect(actions.completeOnboarding).toHaveBeenCalledWith({
        legalName: 'Maya Rivera',
        displayName: 'Maya',
        zip: '95819',
        adultConfirmed: true,
      }),
    )
  })

  it('without the 18+ box it stops, says so, and calls nothing', async () => {
    const actions = makeActions()
    render(<OnboardingFlow actions={actions} onNavigate={vi.fn()} />)
    fill({ adult: false })
    fireEvent.click(continueBtn())
    expect(await screen.findByTestId('onboarding-error')).toHaveTextContent(/18/)
    expect(actions.completeOnboarding).not.toHaveBeenCalled()
  })

  it('requires each field and names the one that is missing', async () => {
    const actions = makeActions()
    render(<OnboardingFlow actions={actions} onNavigate={vi.fn()} />)
    fireEvent.click(continueBtn())
    expect(await screen.findByTestId('onboarding-error')).toBeInTheDocument()
    fill({ zip: '958' })
    fireEvent.click(continueBtn())
    await waitFor(() => expect(screen.getByTestId('onboarding-error')).toHaveTextContent(/zip/i))
    expect(actions.completeOnboarding).not.toHaveBeenCalled()
  })

  it('surfaces a server-side failure and stays put', async () => {
    const actions = makeActions({
      completeOnboarding: vi.fn(async () => ({
        ok: false as const,
        field: 'displayName' as const,
        message: 'We could not finish setting up your account.',
      })),
    })
    const onNavigate = vi.fn()
    render(<OnboardingFlow actions={actions} onNavigate={onNavigate} />)
    fill()
    fireEvent.click(continueBtn())
    await waitFor(() => expect(screen.getByTestId('onboarding-error')).toHaveTextContent('could not finish'))
    expect(onNavigate).not.toHaveBeenCalled()
  })

  it('prefills a name the Member already has', () => {
    render(<OnboardingFlow initialDisplayName="Maya" actions={makeActions()} onNavigate={vi.fn()} />)
    expect(screen.getByTestId('onboarding-name')).toHaveValue('Maya')
  })
})

describe('F081 — the zip decides the metro, and the screen shows it', () => {
  it('shows which metro, then goes home on Continue', async () => {
    const onNavigate = vi.fn()
    render(<OnboardingFlow actions={makeActions()} onNavigate={onNavigate} />)
    fill()
    fireEvent.click(continueBtn())
    expect(await screen.findByTestId('onboarding-metro')).toHaveTextContent('Sacramento-Roseville, CA')
    expect(screen.queryByRole('combobox')).toBeNull() // nobody picks a metro at signup
    expect(onNavigate).not.toHaveBeenCalled()
    fireEvent.click(screen.getByTestId('onboarding-metro-continue'))
    expect(onNavigate).toHaveBeenCalledWith('/')
  })

  it('a zip with no metro goes on to the waitlist question, which names where we are not yet', async () => {
    const actions = makeActions({ completeOnboarding: vi.fn(async () => ({ ok: true as const, metro: null })) })
    render(<OnboardingFlow actions={actions} onNavigate={vi.fn()} metros={[{ id: 'm1', name: 'Boise City, ID' }]} />)
    fill({ zip: '83702' })
    fireEvent.click(continueBtn())
    expect(await screen.findByRole('combobox')).toBeInTheDocument()
    expect(screen.queryByTestId('onboarding-metro')).toBeNull()
  })

  it('lands home once the waitlist step is done', async () => {
    const actions = makeActions({ completeOnboarding: vi.fn(async () => ({ ok: true as const, metro: null })) })
    const onNavigate = vi.fn()
    const onJoinWaitlist = vi.fn(async () => ({
      open: false as const,
      metroName: 'Boise City, ID',
      standing: { combined: 1, target: 300 },
      message: '',
    }))
    render(
      <OnboardingFlow
        actions={actions}
        onNavigate={onNavigate}
        metros={[{ id: 'm1', name: 'Boise City, ID' }]}
        onJoinWaitlist={onJoinWaitlist}
      />,
    )
    fill({ zip: '83702' })
    fireEvent.click(continueBtn())
    fireEvent.change(await screen.findByRole('combobox'), { target: { value: 'm1' } })
    fireEvent.click(screen.getByRole('radio', { name: /find/i }))
    fireEvent.click(screen.getByRole('button', { name: /continue/i }))
    await waitFor(() => expect(onJoinWaitlist).toHaveBeenCalled())
  })
})

describe('F081 — the phone comes first', () => {
  const phoneAuth = {
    sendCode: vi.fn(async () => ({ ok: true as const })),
    verifyCode: vi.fn(async () => ({ ok: true as const })),
  }

  it('asks an unverified member for their phone before anything else', () => {
    render(<OnboardingFlow actions={makeActions()} onNavigate={vi.fn()} phoneVerified={false} phoneAuth={phoneAuth} />)
    expect(screen.getByTestId('phone-form')).toBeInTheDocument()
    expect(screen.queryByTestId('onboarding-form')).toBeNull()
  })

  it('moves to the name once the code checks out', async () => {
    render(<OnboardingFlow actions={makeActions()} onNavigate={vi.fn()} phoneVerified={false} phoneAuth={phoneAuth} />)
    fireEvent.change(screen.getByLabelText(/phone number/i), { target: { value: '9165550134' } })
    fireEvent.click(screen.getByRole('button', { name: /text me a code/i }))
    fireEvent.change(await screen.findByLabelText(/code/i), { target: { value: '123456' } })
    fireEvent.click(screen.getByRole('button', { name: /verify/i }))
    expect(await screen.findByTestId('onboarding-form')).toBeInTheDocument()
  })

  it('skips straight to the name for a verified member', () => {
    render(<OnboardingFlow actions={makeActions()} onNavigate={vi.fn()} phoneVerified />)
    expect(screen.getByTestId('onboarding-form')).toBeInTheDocument()
  })
})
