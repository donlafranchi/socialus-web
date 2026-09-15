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

  // T163 amended this: Continue no longer goes home, it goes to the metro
  // step, which is now unconditional (Don's ruling 2026-09-14). Home is where
  // the METRO step lands, and that hand-off is covered in MetroWaitlistStep's
  // own tests. What this one still owns is the trimmed name reaching the action.
  it('writes the trimmed name and advances on Continue', async () => {
    const actions = makeActions()
    const onNavigate = vi.fn()
    render(
      <OnboardingFlow
        actions={actions}
        onNavigate={onNavigate}
        metros={[{ id: 'm1', name: 'Boise City-Mountain Home-Ontario, ID-OR' }]}
      />,
    )
    fireEvent.change(screen.getByTestId('onboarding-name'), { target: { value: '  Maya  ' } })
    fireEvent.click(continueBtn())
    await waitFor(() =>
      expect(actions.completeOnboarding).toHaveBeenCalledWith({ displayName: 'Maya' }),
    )
    // Advanced rather than navigated: the name form is gone, the metro question
    // is on screen, and nothing has gone home yet.
    expect(await screen.findByRole('combobox')).toBeInTheDocument()
    expect(screen.queryByTestId('onboarding-form')).toBeNull()
    expect(onNavigate).not.toHaveBeenCalled()
  })

  it('lands home once the metro step is done', async () => {
    const actions = makeActions()
    const onNavigate = vi.fn()
    const onJoinWaitlist = vi.fn(async () => ({
      open: true as const,
      metroName: 'Sacramento-Roseville, CA',
      standing: { combined: 0, target: 0 },
      message: '',
    }))
    render(
      <OnboardingFlow
        actions={actions}
        onNavigate={onNavigate}
        metros={[{ id: 'm1', name: 'Sacramento-Roseville, CA' }]}
        onJoinWaitlist={onJoinWaitlist}
      />,
    )
    fireEvent.change(screen.getByTestId('onboarding-name'), { target: { value: 'Maya' } })
    fireEvent.click(continueBtn())
    const select = await screen.findByRole('combobox')
    fireEvent.change(select, { target: { value: 'm1' } })
    fireEvent.click(screen.getByRole('radio', { name: /find/i }))
    fireEvent.click(screen.getByRole('button', { name: /continue/i }))
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

describe('T163 — the metro step is unconditional', () => {
  it('asks every signup, even when the metro list came back empty', async () => {
    // Don's ruling 2026-09-14. The guard this replaces meant a failed metro
    // query skipped the question silently; the step now renders and reports
    // the failure itself.
    const completeOnboarding = vi.fn(async () => ({ ok: true }) as const)
    render(
      <OnboardingFlow
        actions={{ completeOnboarding }}
        metros={[]}
        onNavigate={() => {}}
      />,
    )
    fireEvent.change(screen.getByTestId('onboarding-name'), {
      target: { value: 'Ada' },
    })
    fireEvent.click(screen.getByTestId('onboarding-continue'))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
  })
})
