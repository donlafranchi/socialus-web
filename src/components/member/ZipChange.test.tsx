// #568 (F081.4) — a member who moves changes their zip on /you, and their market follows. Not one-and-done.

import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { ZipChange } from './ZipChange'

afterEach(cleanup)

const change = (result: unknown) => vi.fn(async (_zip: string) => result as never)
const start = () => fireEvent.click(screen.getByRole('button', { name: /change zip/i }))
const type = (v: string) => fireEvent.change(screen.getByLabelText(/zip/i), { target: { value: v } })

describe('ZipChange', () => {
  it('shows the member\'s own zip and a way to change it', () => {
    render(<ZipChange zip="95746" area="Sacramento" change={change({ ok: true })} />)
    expect(screen.getByTestId('zip-current')).toHaveTextContent('95746')
    expect(screen.getByTestId('zip-current')).toHaveTextContent('Sacramento')
    expect(screen.queryByLabelText(/zip/i)).toBeNull()
  })

  // [guards F081.4 partial: the zip can be changed on You, and the market follows]
  it('sends the new zip and says which area it decided', async () => {
    const c = change({ ok: true, marketName: 'Sacramento', open: true })
    render(<ZipChange zip="95746" area="Sacramento" change={c} />)
    start()
    type('95819')
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    await waitFor(() => expect(c).toHaveBeenCalledWith('95819'))
    expect(await screen.findByTestId('zip-result')).toHaveTextContent('You’re in Sacramento')
    expect(screen.getByTestId('zip-current')).toHaveTextContent('95819')
  })

  it('a waiting area is named, with nothing to pick', async () => {
    render(<ZipChange zip="95746" area="Sacramento" change={change({ ok: true, marketName: 'Yuba County, CA', open: false })} />)
    start()
    type('95901')
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    expect(await screen.findByTestId('zip-result')).toHaveTextContent('SocialUs isn’t in Yuba County, CA yet')
    expect(screen.queryByRole('combobox')).toBeNull()
  })

  // [guards F103.2 partial: an unknown zip is refused with the exact words and the old zip stays]
  it('shows the refusal where the zip is, and keeps the old zip', async () => {
    render(<ZipChange zip="95746" area="Sacramento" change={change({ ok: false, message: "We don't recognize that zip, try again." })} />)
    start()
    type('00000')
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent("We don't recognize that zip, try again.")
    expect(screen.getByLabelText(/zip/i)).toHaveValue('00000')
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(screen.getByTestId('zip-current')).toHaveTextContent('95746')
  })

  it('will not send anything but five digits', () => {
    const c = change({ ok: true })
    render(<ZipChange zip="95746" area={null} change={c} />)
    start()
    type('958a')
    expect(screen.getByLabelText(/zip/i)).toHaveValue('958')
    expect(screen.getByRole('button', { name: /^save$/i })).toBeDisabled()
    expect(c).not.toHaveBeenCalled()
  })

  it('uses the phone\'s numeric pad and postal-code autofill', () => {
    render(<ZipChange zip="95746" area={null} change={change({ ok: true })} />)
    start()
    const input = screen.getByLabelText(/zip/i)
    expect(input).toHaveAttribute('inputmode', 'numeric')
    expect(input).toHaveAttribute('autocomplete', 'postal-code')
  })

  it('a failed save says so plainly', async () => {
    render(<ZipChange zip="95746" area={null} change={vi.fn(async () => { throw new Error('boom') })} />)
    start()
    type('95819')
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/didn.t go through/i)
  })

  it('says no MSA, CSA or metro', async () => {
    const { container } = render(<ZipChange zip="95746" area="Sacramento" change={change({ ok: true, marketName: 'Sacramento', open: true })} />)
    start()
    type('95819')
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    await screen.findByTestId('zip-result')
    expect(container.textContent).not.toMatch(/\b(MSA|CSA|metros?)\b/i)
  })
})
