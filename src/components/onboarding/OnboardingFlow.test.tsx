import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react'
import { COPY } from '@/lib/copy'
import { OPEN_COPY, SIGNUP_ROLE_COPY } from '@/lib/open-market-copy'
import '@testing-library/jest-dom/vitest'
import { OnboardingFlow, type OnboardingActions } from './OnboardingFlow'

// T089 → #222 — onboarding is the F081 signup screen. Real DB writes are the F030 eval's job.

afterEach(() => cleanup())

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

function makeActions(over: Partial<OnboardingActions> = {}): OnboardingActions {
  return {
    completeOnboarding: vi.fn(async () => ({ ok: true as const, metro: { name: 'Sacramento' }, waiting: null })),
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

describe('F103 — the zip decides the market, and the screen shows it', () => {
  const waiting = { metroId: 'm-yuba', name: 'Yuba County, CA', key: 'county-06115' }
  const waitingActions = () => makeActions({ completeOnboarding: vi.fn(async () => ({ ok: true as const, metro: null, waiting })) })

  it('shows which market, then the optional interests step on Continue', async () => {
    const onNavigate = vi.fn()
    render(<OnboardingFlow actions={makeActions()} onNavigate={onNavigate} />)
    fill()
    fireEvent.click(continueBtn())
    expect(await screen.findByTestId('onboarding-metro')).toHaveTextContent('Sacramento')
    expect(screen.queryByRole('combobox')).toBeNull() // nobody picks a market at signup
    expect(onNavigate).not.toHaveBeenCalled()
    fireEvent.click(screen.getByTestId('onboarding-metro-continue'))
    expect(screen.getByTestId('onboarding-interests')).toBeInTheDocument()
    expect(onNavigate).not.toHaveBeenCalled()
  })

  // #892 — one optional, skippable step after sign-up.
  it('the interests step can be skipped: nothing saved, straight home', async () => {
    const onNavigate = vi.fn()
    const saveInterests = vi.fn(async () => ({ ok: true as const, addedTags: [] }))
    render(<OnboardingFlow actions={makeActions({ saveInterests })} onNavigate={onNavigate} />)
    fill()
    fireEvent.click(continueBtn())
    fireEvent.click(await screen.findByTestId('onboarding-metro-continue'))
    fireEvent.click(screen.getByRole('button', { name: /skip/i }))
    expect(saveInterests).not.toHaveBeenCalled()
    expect(onNavigate).toHaveBeenCalledWith('/')
  })

  it('the interests step saves what was picked, then goes home', async () => {
    const onNavigate = vi.fn()
    const saveInterests = vi.fn(async () => ({ ok: true as const, addedTags: ['live-music', 'gardening'] }))
    render(<OnboardingFlow actions={makeActions({ saveInterests })} onNavigate={onNavigate} />)
    fill()
    fireEvent.click(continueBtn())
    fireEvent.click(await screen.findByTestId('onboarding-metro-continue'))
    const step = within(screen.getByTestId('onboarding-interests'))
    expect(step.getAllByRole('checkbox')).toHaveLength(12)
    fireEvent.click(step.getByRole('checkbox', { name: 'Live music' }))
    fireEvent.click(step.getByRole('checkbox', { name: 'Gardening' }))
    fireEvent.click(step.getByRole('button', { name: /save/i }))
    await waitFor(() => expect(onNavigate).toHaveBeenCalledWith('/'))
    expect(saveInterests).toHaveBeenCalledWith({ tags: ['live-music', 'gardening'] })
  })

  // [guards F103.3 partial: a waiting market is named and nothing is picked — no list, no select]
  it('a waiting market is named, and there is nothing to pick', async () => {
    render(<OnboardingFlow actions={waitingActions()} onNavigate={vi.fn()} />)
    fill({ zip: '95901' })
    fireEvent.click(continueBtn())
    expect(await screen.findByTestId('waitlist-market')).toHaveTextContent('Yuba County, CA')
    expect(screen.queryByRole('combobox')).toBeNull()
    expect(screen.queryByTestId('onboarding-metro')).toBeNull()
  })

  // #1090 — one sign-up path: outside an open market, the role question, then that market's page.
  const joined = vi.fn(async () => ({ open: false as const, metroName: 'Yuba County, CA', standing: { combined: 1, target: 300 }, message: '' }))

  it('says it isn’t open there yet, in Don’s words, above the role question', async () => {
    render(<OnboardingFlow actions={waitingActions()} onNavigate={vi.fn()} onJoinWaitlist={joined} />)
    fill({ zip: '95901' })
    fireEvent.click(continueBtn())
    expect(await screen.findByRole('heading', { level: 1, name: OPEN_COPY.notOpen('Yuba County, CA') })).toBeInTheDocument()
    expect(screen.getByText(OPEN_COPY.notOpenBody)).toBeInTheDocument()
    expect(screen.getByRole('group', { name: SIGNUP_ROLE_COPY.legend })).toBeInTheDocument()
  })

  it('a supporter joins the market it named, then lands on that market’s page', async () => {
    const onNavigate = vi.fn()
    render(<OnboardingFlow actions={waitingActions()} onNavigate={onNavigate} onJoinWaitlist={joined} />)
    fill({ zip: '95901' })
    fireEvent.click(continueBtn())
    fireEvent.click(await screen.findByRole('radio', { name: SIGNUP_ROLE_COPY.supporter }))
    expect(screen.queryByLabelText(SIGNUP_ROLE_COPY.link)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /continue/i }))
    await waitFor(() => expect(joined).toHaveBeenCalledWith({ metroId: 'm-yuba', role: 'patron' }))
    await waitFor(() => expect(onNavigate).toHaveBeenCalledWith('/open/county-06115'))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('a maker can leave a website or socials', async () => {
    const onNavigate = vi.fn()
    render(<OnboardingFlow actions={waitingActions()} onNavigate={onNavigate} onJoinWaitlist={joined} />)
    fill({ zip: '95901' })
    fireEvent.click(continueBtn())
    fireEvent.click(await screen.findByRole('radio', { name: new RegExp(SIGNUP_ROLE_COPY.maker) }))
    fireEvent.change(screen.getByLabelText(SIGNUP_ROLE_COPY.link), { target: { value: 'https://example.com' } })
    fireEvent.click(screen.getByRole('button', { name: /continue/i }))
    await waitFor(() => expect(joined).toHaveBeenCalledWith({ metroId: 'm-yuba', role: 'creator', link: 'https://example.com' }))
    await waitFor(() => expect(onNavigate).toHaveBeenCalledWith('/open/county-06115'))
  })

  it('an unknown zip stays on the form with the refusal under the zip', async () => {
    const actions = makeActions({ completeOnboarding: vi.fn(async () => ({ ok: false as const, field: 'zip' as const, message: "We don't recognize that zip, try again." })) })
    render(<OnboardingFlow actions={actions} onNavigate={vi.fn()} />)
    fill({ zip: '00000' })
    fireEvent.click(continueBtn())
    expect(await screen.findByText("We don't recognize that zip, try again.")).toBeInTheDocument()
    expect(screen.getByTestId('onboarding-form')).toBeInTheDocument()
  })

  // [guards F103.4 partial: the signup screens never say MSA, CSA or metro]
  it.each([
    ['the form', async () => {}],
    ['the open screen', async () => { fill(); fireEvent.click(continueBtn()); await screen.findByTestId('onboarding-metro') }],
    ['the waiting screen', async () => { fill({ zip: '95901' }); fireEvent.click(continueBtn()); await screen.findByTestId('waitlist-market') }],
  ])('%s says no MSA, CSA or metro', async (name, go) => {
    const actions = name === 'the waiting screen' ? makeActions({ completeOnboarding: vi.fn(async () => ({ ok: true as const, metro: null, waiting: { metroId: 'm', name: 'Yuba County, CA', key: 'county-06115' } })) }) : makeActions()
    const { container } = render(<OnboardingFlow actions={actions} onNavigate={vi.fn()} />)
    await go()
    expect(container.textContent).not.toMatch(/\b(MSA|CSA|metros?)\b/i)
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
