// #987 — claiming a Page from its own end box: a code to the business, then the Page is yours.

import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { ClaimForm, type ClaimHandlers } from './ClaimForm'

afterEach(cleanup)

const handlers = (over: Partial<ClaimHandlers> = {}): ClaimHandlers => ({
  choices: vi.fn().mockResolvedValue({ emailDomain: 'rosas.com', phone: null, proof: false }),
  start: vi.fn().mockResolvedValue({ ok: true, claimId: 'c-1', sentTo: 'rosa@rosas.com' }),
  verify: vi.fn().mockResolvedValue({ ok: true }),
  proof: vi.fn().mockResolvedValue({ ok: true }),
  ...over,
})
const fill = (name: string, value: string) => fireEvent.change(document.querySelector(`[name="${name}"]`)!, { target: { value } })

describe('ClaimForm', () => {
  it('asks a signed-out visitor to sign in and come back', () => {
    render(<ClaimForm groupId="g-1" pagePath="/g/abc" loggedIn={false} handlers={handlers()} onDone={vi.fn()} />)
    expect(screen.getByRole('link', { name: 'Sign in to claim this Page' })).toHaveAttribute('href', '/auth/login?next=%2Fg%2Fabc')
  })

  it('emails a code to an address at the business’s domain, then the right code claims it', async () => {
    const h = handlers()
    const onDone = vi.fn()
    render(<ClaimForm groupId="g-1" pagePath="/g/abc" loggedIn handlers={h} onDone={onDone} />)
    await screen.findByText('@rosas.com')
    fill('local', 'rosa')
    fireEvent.submit(screen.getByTestId('claim-start-form'))
    await screen.findByText(/We sent a 6-digit code to rosa@rosas.com/)
    expect(h.start).toHaveBeenCalledWith({ groupId: 'g-1', method: 'email', email: 'rosa@rosas.com' })
    fill('code', '123456')
    fireEvent.submit(screen.getByTestId('claim-code-form'))
    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(h.verify).toHaveBeenCalledWith({ claimId: 'c-1', code: '123456', pagePath: '/g/abc' })
  })

  it('says so when the code is wrong', async () => {
    const h = handlers({ verify: vi.fn().mockResolvedValue({ ok: false, reason: 'wrong_code' }) })
    render(<ClaimForm groupId="g-1" pagePath="/g/abc" loggedIn handlers={h} onDone={vi.fn()} />)
    await screen.findByText('@rosas.com')
    fill('local', 'rosa')
    fireEvent.submit(screen.getByTestId('claim-start-form'))
    await screen.findByTestId('claim-code-form')
    fill('code', '000000')
    fireEvent.submit(screen.getByTestId('claim-code-form'))
    expect(await screen.findByRole('alert')).toHaveTextContent("That code isn't right")
  })

  it('a second claimant is pointed to reporting the Page', async () => {
    const h = handlers({ start: vi.fn().mockResolvedValue({ ok: false, reason: 'taken' }) })
    render(<ClaimForm groupId="g-1" pagePath="/g/abc" loggedIn handlers={h} onDone={vi.fn()} />)
    await screen.findByText('@rosas.com')
    fill('local', 'rosa')
    fireEvent.submit(screen.getByTestId('claim-start-form'))
    expect(await screen.findByRole('alert')).toHaveTextContent('report the Page')
  })

  it('offers a text only when the phone path is on', async () => {
    const h = handlers({ choices: vi.fn().mockResolvedValue({ emailDomain: null, phone: '•••-•••-0100', proof: false }) })
    render(<ClaimForm groupId="g-1" pagePath="/g/abc" loggedIn handlers={h} onDone={vi.fn()} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Text a code to •••-•••-0100' }))
    await waitFor(() => expect(h.start).toHaveBeenCalledWith({ groupId: 'g-1', method: 'phone' }))
  })

  it('with no domain and no phone, sends a link as proof for review', async () => {
    const h = handlers({ choices: vi.fn().mockResolvedValue({ emailDomain: null, phone: null, proof: true }) })
    const onDone = vi.fn()
    render(<ClaimForm groupId="g-1" pagePath="/g/abc" loggedIn handlers={h} onDone={onDone} />)
    await screen.findByTestId('claim-proof-form')
    fill('proofUrl', 'https://instagram.com/rosas')
    fireEvent.submit(screen.getByTestId('claim-proof-form'))
    await waitFor(() => expect(onDone).toHaveBeenCalledWith(expect.stringContaining('look at it soon')))
    expect(h.proof).toHaveBeenCalledWith({ groupId: 'g-1', proofUrl: 'https://instagram.com/rosas', note: undefined })
  })
})
