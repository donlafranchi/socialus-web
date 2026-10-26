// #353 — the box at the end of an unclaimed Page.

import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { UnclaimedBox } from './UnclaimedBox'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

afterEach(cleanup)

const setup = (result: { ok: true } | { ok: false; reason: 'limit' | 'failed' } = { ok: true }) => {
  const onRemove = vi.fn().mockResolvedValue(result)
  const claim = {
    choices: vi.fn().mockResolvedValue({ emailDomain: 'rosas.com', phone: null, proof: false }),
    start: vi.fn(),
    verify: vi.fn(),
    proof: vi.fn(),
  }
  render(<UnclaimedBox groupId="g-1" pagePath="/g/abc" hasPhoto loggedIn claim={claim} onRemove={onRemove} />)
  return { claim, onRemove }
}

const fill = (name: string, value: string) =>
  fireEvent.change(document.querySelector(`[name="${name}"]`)!, { target: { value } })

describe('UnclaimedBox', () => {
  it('Remove sends the contact and the tick, then says the Page is hidden', async () => {
    const { onRemove } = setup()
    fireEvent.click(screen.getByTestId('unclaimed-remove'))
    fill('contact', 'owner@example.com')
    fireEvent.click(document.querySelector('[name="confirmed"]')!)
    fireEvent.submit(screen.getByTestId('unclaimed-remove-form'))
    await waitFor(() => expect(screen.getByTestId('unclaimed-done')).toHaveTextContent('hidden now'))
    expect(onRemove).toHaveBeenCalledWith({
      groupId: 'g-1',
      scope: 'page',
      contact: 'owner@example.com',
      reason: undefined,
      confirmed: true,
      pagePath: '/g/abc',
    })
  })

  it('Remove can take just the photo', async () => {
    const { onRemove } = setup()
    fireEvent.click(screen.getByTestId('unclaimed-remove'))
    fireEvent.click(screen.getByLabelText('Just the photo'))
    fill('contact', 'owner@example.com')
    fireEvent.click(document.querySelector('[name="confirmed"]')!)
    fireEvent.submit(screen.getByTestId('unclaimed-remove-form'))
    await waitFor(() => expect(screen.getByTestId('unclaimed-done')).toHaveTextContent('The photo is hidden now'))
    expect(onRemove.mock.calls[0]![0].scope).toBe('photo')
  })

  it('Claim opens the self-serve claim, not a contact form', async () => {
    const { claim } = setup()
    fireEvent.click(screen.getByTestId('unclaimed-claim'))
    expect(await screen.findByText('@rosas.com')).toBeInTheDocument()
    expect(claim.choices).toHaveBeenCalledWith('g-1')
    expect(document.querySelector('[name="name"]')).toBeNull()
  })

  it('says so when the device is over its daily limit', async () => {
    setup({ ok: false, reason: 'limit' })
    fireEvent.click(screen.getByTestId('unclaimed-remove'))
    fill('contact', 'x@example.com')
    fireEvent.submit(screen.getByTestId('unclaimed-remove-form'))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('try again tomorrow'))
  })
})
