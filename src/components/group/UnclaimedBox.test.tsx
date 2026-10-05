// #353 — the box at the end of an unclaimed Page.

import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { UnclaimedBox } from './UnclaimedBox'

afterEach(cleanup)

const setup = (result: { ok: true } | { ok: false; reason: 'limit' | 'failed' } = { ok: true }) => {
  const onClaim = vi.fn().mockResolvedValue(result)
  const onRemove = vi.fn().mockResolvedValue(result)
  render(<UnclaimedBox groupId="g-1" pagePath="/g/abc" onClaim={onClaim} onRemove={onRemove} />)
  return { onClaim, onRemove }
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
      contact: 'owner@example.com',
      reason: undefined,
      confirmed: true,
      pagePath: '/g/abc',
    })
  })

  it('Claim sends name and contact', async () => {
    const { onClaim } = setup()
    fireEvent.click(screen.getByTestId('unclaimed-claim'))
    fill('name', 'Pat')
    fill('contact', 'pat@example.com')
    fireEvent.submit(screen.getByTestId('unclaimed-claim-form'))
    await waitFor(() => expect(screen.getByTestId('unclaimed-done')).toBeInTheDocument())
    expect(onClaim).toHaveBeenCalledWith({ groupId: 'g-1', name: 'Pat', contact: 'pat@example.com', message: undefined })
  })

  it('says so when the device is over its daily limit', async () => {
    setup({ ok: false, reason: 'limit' })
    fireEvent.click(screen.getByTestId('unclaimed-remove'))
    fill('contact', 'x@example.com')
    fireEvent.submit(screen.getByTestId('unclaimed-remove-form'))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('try again tomorrow'))
  })
})
