import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { OnboardingFlow, type OnboardingActions } from './OnboardingFlow'

// T089 — onboarding is one field. Real DB writes are the F030 eval's job.

afterEach(() => cleanup())

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

function makeActions(over: Partial<OnboardingActions> = {}): OnboardingActions {
  return {
    completeOnboarding: vi.fn(async () => ({ ok: true as const })),
    ...over,
  }
}

const continueBtn = () => screen.getByRole('button', { name: /Continue/i })

describe('T089 — OnboardingFlow', () => {
  it('asks only for a display name', () => {
    render(<OnboardingFlow actions={makeActions()} onNavigate={vi.fn()} />)
    expect(screen.getByTestId('onboarding-name')).toBeInTheDocument()
    expect(screen.queryByTestId('onboarding-handle')).toBeNull()
    expect(screen.queryByTestId('onboarding-locality')).toBeNull()
    expect(screen.queryByTestId('onboarding-interests')).toBeNull()
  })

  it('writes the name and navigates home on Continue', async () => {
    const actions = makeActions()
    const onNavigate = vi.fn()
    render(<OnboardingFlow actions={actions} onNavigate={onNavigate} />)
    fireEvent.change(screen.getByTestId('onboarding-name'), { target: { value: '  Maya  ' } })
    fireEvent.click(continueBtn())
    await waitFor(() =>
      expect(actions.completeOnboarding).toHaveBeenCalledWith({ displayName: 'Maya' }),
    )
    await waitFor(() => expect(onNavigate).toHaveBeenCalledWith('/'))
  })

  it('requires a name', async () => {
    const actions = makeActions()
    render(<OnboardingFlow actions={actions} onNavigate={vi.fn()} />)
    fireEvent.click(continueBtn())
    await waitFor(() => expect(screen.getByTestId('onboarding-error')).toBeInTheDocument())
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
    fireEvent.change(screen.getByTestId('onboarding-name'), { target: { value: 'Maya' } })
    fireEvent.click(continueBtn())
    await waitFor(() =>
      expect(screen.getByTestId('onboarding-error')).toHaveTextContent('could not finish'),
    )
    expect(onNavigate).not.toHaveBeenCalled()
  })

  it('prefills a name the Member already has', () => {
    render(<OnboardingFlow initialDisplayName="Maya" actions={makeActions()} onNavigate={vi.fn()} />)
    expect(screen.getByTestId('onboarding-name')).toHaveValue('Maya')
  })
})
