// #1320 — the business page and the contact page: every field on one screen, autofill attributes, one submit.
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

const push = vi.fn()
const replace = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, replace }), useSearchParams: () => new URLSearchParams() }))
const check = vi.fn()
const join = vi.fn()
vi.mock('@/app/_actions/waitlist-journey-actions', () => ({ checkWaitlistZipAction: (z: string) => check(z), joinWaitlistJourneyAction: (a: unknown) => join(a) }))

import { JourneyScreen } from './JourneyScreen'
import { WaitlistProvider } from './WaitlistProvider'

const renderStep = (step: 'plans' | 'business' | 'contact', plans: string[] = ['teach']) => {
  sessionStorage.setItem('socialus.waitlist', JSON.stringify({ plans }))
  return render(
    <WaitlistProvider>
      <JourneyScreen step={step} />
    </WaitlistProvider>,
  )
}
const fill = (label: string, v: string) => fireEvent.change(screen.getByLabelText(label), { target: { value: v } })

beforeEach(() => {
  push.mockReset(); replace.mockReset(); check.mockReset(); join.mockReset(); sessionStorage.clear()
})
afterEach(cleanup)

describe('JourneyScreen (#1320)', () => {
  it('plans: one short explainer line on top, then the chips', async () => {
    renderStep('plans', [])
    expect(await screen.findByText(/opens town by town/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /I teach a class/ })).toBeInTheDocument()
  })

  it('business: kinds, name and link on one page, all optional, with Skip', async () => {
    renderStep('business')
    expect(await screen.findByRole('button', { name: 'Food and drink' })).toBeInTheDocument()
    expect(screen.getByLabelText('Business or group name')).toBeInTheDocument()
    expect(screen.getByLabelText('Website or social link')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }))
    expect(push).toHaveBeenCalledWith('/join/contact')
  })

  it('contact: name, zip, email, mobile on one page in that order, with autofill attributes', async () => {
    renderStep('contact', ['find-events'])
    const name = await screen.findByLabelText('Your name')
    const fields = [name, screen.getByLabelText('Zip code'), screen.getByLabelText('Email'), screen.getByLabelText('Mobile number')]
    expect(fields.map((f) => f.getAttribute('autocomplete'))).toEqual(['given-name', 'postal-code', 'email', 'tel'])
    for (let i = 1; i < fields.length; i++) expect(fields[i - 1].compareDocumentPosition(fields[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByText(/bots and spam/)).toBeInTheDocument()
    expect(screen.getByText(/look out for one another/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'More about this' }))
    expect(screen.getByText(/Illegal content is reported to police/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Skip' })).toBeNull()
  })

  it('contact: an unknown zip keeps its message and nothing is joined', async () => {
    check.mockResolvedValue({ ok: false })
    renderStep('contact', ['find-events'])
    fill('Your name', 'Sam'); fill('Zip code', '00000'); fill('Email', 'a@b.co'); fill('Mobile number', '(916) 555-0142')
    fireEvent.click(screen.getByRole('button', { name: 'Join the waitlist' }))
    expect(await screen.findByText('We don’t recognize that zip, try again.')).toBeInTheDocument()
    expect(join).not.toHaveBeenCalled()
  })

  it('contact: a missing name or bad email or bad number stops before any call', async () => {
    renderStep('contact', ['find-events'])
    fireEvent.click(await screen.findByRole('button', { name: 'Join the waitlist' }))
    expect(await screen.findByText('Tell us what to call you.')).toBeInTheDocument()
    fill('Your name', 'Sam'); fill('Zip code', '95814'); fill('Email', 'nope')
    fireEvent.click(screen.getByRole('button', { name: 'Join the waitlist' }))
    expect(await screen.findByText('That doesn’t look like an email.')).toBeInTheDocument()
    fill('Email', 'a@b.co'); fill('Mobile number', '555')
    fireEvent.click(screen.getByRole('button', { name: 'Join the waitlist' }))
    expect(await screen.findByText('That doesn’t look like a mobile number.')).toBeInTheDocument()
    expect(check).not.toHaveBeenCalled(); expect(join).not.toHaveBeenCalled()
  })

  it('contact: a good submit sends all answers once and goes to the finish; discover-only sends no business answers', async () => {
    check.mockResolvedValue({ ok: true, market: 'Sacramento' })
    join.mockResolvedValue({ ok: true, market: 'Sacramento', waiting: 4 })
    renderStep('contact', ['find-events'])
    fill('Your name', 'Sam'); fill('Zip code', '95814'); fill('Email', 'a@b.co'); fill('Mobile number', '(916) 555-0142')
    fireEvent.click(screen.getByRole('button', { name: 'Join the waitlist' }))
    await waitFor(() => expect(push).toHaveBeenCalledWith('/join/done'))
    expect(join).toHaveBeenCalledTimes(1)
    expect(join.mock.calls[0][0]).toMatchObject({ plans: ['find-events'], kinds: [], offerName: '', name: 'Sam', zip: '95814', email: 'a@b.co', phone: '(916) 555-0142' })
  })

  it('contact: every field has a visible label, the reason is tied to the mobile field, and an error focuses its field', async () => {
    renderStep('contact', ['find-events'])
    const phone = await screen.findByLabelText('Mobile number')
    expect(phone.closest('label')).toHaveTextContent('Mobile number')
    expect(phone.getAttribute('aria-describedby')).toContain('phone-why')
    fireEvent.click(screen.getByRole('button', { name: 'Join the waitlist' }))
    await screen.findByText('Tell us what to call you.')
    await waitFor(() => expect(screen.getByLabelText('Your name')).toHaveFocus())
  })

  it('contact opened with no plans (an old link in a fresh tab) goes to the plans first', async () => {
    renderStep('contact', [])
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/join/plans'))
  })

  it('business page opened by a discover-only person goes back to the plans', async () => {
    renderStep('business', ['find-events'])
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/join/plans'))
  })
})
