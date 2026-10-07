// T160 (Issue #62) — the control that sends a report.
// Trace: planning/scenario-F058.md acceptance 1 and 2.
//
// Two things are load-bearing here and easy to lose in a refactor:
//   * after sending, NOTHING on the page changes for the reporter beyond the
//     confirmation. F058 acceptance 2 is that a report changes nothing visible
//     to anyone, and the reporter is part of "anyone".
//   * a signed-out member sees the control and is sent to sign-in, not to a
//     dead end and not to a disabled button.

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { ReportControl } from './ReportControl'

afterEach(cleanup)

const send = vi.fn(async () => ({ ok: true as const }))

beforeEach(() => {
  send.mockClear()
  send.mockImplementation(async () => ({ ok: true as const }))
})

function renderControl(overrides: Partial<Parameters<typeof ReportControl>[0]> = {}) {
  return render(
    <ReportControl
      subjectId="grp-1"
      subjectLabel="Oak Park Sourdough"
      loggedIn
      onSend={send}
      {...overrides}
    />,
  )
}

describe('the ⋯ overflow menu', () => {
  it('is reachable by its accessible name', () => {
    renderControl()
    expect(screen.getByRole('button', { name: 'More options' })).toBeInTheDocument()
  })

  it('is closed until it is opened', () => {
    renderControl()
    expect(screen.queryByRole('menuitem')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'More options' })).toHaveAttribute(
      'aria-expanded',
      'false',
    )
  })

  it('opens to exactly one item — Report to the operator', () => {
    renderControl()
    fireEvent.click(screen.getByRole('button', { name: 'More options' }))
    const items = screen.getAllByRole('menuitem')
    expect(items).toHaveLength(1)
    expect(items[0]).toHaveTextContent('Report to the operator')
  })

  it('closes on Escape without opening the sheet', () => {
    renderControl()
    const trigger = screen.getByRole('button', { name: 'More options' })
    fireEvent.click(trigger)
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
    expect(screen.queryByRole('menuitem')).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('the report sheet', () => {
  function openSheet() {
    fireEvent.click(screen.getByRole('button', { name: 'More options' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /report to the operator/i }))
  }

  it('says who is on the other end, in those words', () => {
    renderControl()
    openSheet()
    expect(screen.getByRole('dialog')).toHaveTextContent('This goes to a person, not a queue')
  })

  it('carries a text area and a Send', () => {
    renderControl()
    openSheet()
    expect(screen.getByRole('textbox')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /send/i })).toBeInTheDocument()
  })

  it('is a modal dialog, so the rest of the page is inert', () => {
    renderControl()
    openSheet()
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true')
  })

  it('moves focus into the sheet on open', async () => {
    renderControl()
    openSheet()
    await waitFor(() => {
      expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true)
    })
  })

  it('closes on Escape and returns focus to the ⋯', async () => {
    renderControl()
    const trigger = screen.getByRole('button', { name: 'More options' })
    openSheet()
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(document.activeElement).toBe(trigger)
    })
  })

  it('traps Tab inside the sheet', () => {
    renderControl()
    openSheet()
    const dialog = screen.getByRole('dialog')
    const focusable = Array.from(
      dialog.querySelectorAll<HTMLElement>('button, textarea, [href]'),
    )
    focusable[focusable.length - 1].focus()
    fireEvent.keyDown(dialog, { key: 'Tab' })
    expect(document.activeElement).toBe(focusable[0])
  })

  it('will not send an empty report', () => {
    renderControl()
    openSheet()
    fireEvent.click(screen.getByRole('button', { name: /send/i }))
    expect(send).not.toHaveBeenCalled()
  })
})

describe('sending', () => {
  function openAndSend(body = 'This photo does not belong here.', reason: RegExp | null = /^spam$/i) {
    fireEvent.click(screen.getByRole('button', { name: 'More options' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /report to the operator/i }))
    if (reason) fireEvent.click(screen.getByRole('radio', { name: reason }))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: body } })
    fireEvent.click(screen.getByRole('button', { name: /send/i }))
  }

  // [guards F078.9]
  it('will not send without a reason chosen', () => {
    renderControl()
    openAndSend('words, but no reason', null)
    expect(send).not.toHaveBeenCalled()
  })

  it('offers sensitive content as a reason, naming what it covers', () => {
    renderControl()
    openAndSend('x', null)
    expect(screen.getByRole('radio', { name: /sensitive content.*children.*animals.*fend for themselves/i })).toBeInTheDocument()
  })

  it('keeps every radio full size beside a wrapped label', () => {
    renderControl()
    openAndSend('x', null)
    for (const r of screen.getAllByRole('radio')) expect(r.className).toContain('shrink-0')
  })

  it('passes the subject and the member\'s own words to the action', async () => {
    renderControl()
    openAndSend('the photo is stolen')
    await waitFor(() => {
      expect(send).toHaveBeenCalledWith({ subjectId: 'grp-1', category: 'spam', body: 'the photo is stolen' })
    })
  })

  it('confirms, and says the report went to a person', async () => {
    renderControl()
    openAndSend()
    expect(await screen.findByRole('status')).toHaveTextContent(/thank you|sent|a person/i)
  })

  it('changes nothing else on the page for the reporter', async () => {
    const { container } = renderControl()
    openAndSend()
    await screen.findByRole('status')

    // No count, no badge, no "reported" marker, and no hint about whether the
    // photo was hidden — that last one would disclose that a Page is already
    // reported or already locked.
    const text = container.textContent ?? ''
    expect(text).not.toMatch(/\breported\b(?!\s+to)/i)
    expect(text).not.toMatch(/hidden|hid\b|taken down|removed/i)
    expect(text).not.toMatch(/\b\d+\s+(report|flag)/i)
  })

  it('keeps the confirmation out of the header\'s layout', async () => {
    // Regression: rendered inline, the confirmation became a flex sibling of
    // the ⋯ inside the Page header and squeezed the title onto two lines.
    // Taking it out of normal flow is what makes it unable to do that to any
    // surface that hosts this control.
    renderControl()
    openAndSend()
    const status = await screen.findByTestId('report-sent')
    expect(status.className).toMatch(/\bfixed\b/)
  })

  it('can be dismissed', async () => {
    renderControl()
    openAndSend()
    await screen.findByTestId('report-sent')
    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }))
    expect(screen.queryByTestId('report-sent')).not.toBeInTheDocument()
  })

  it('closes the sheet once the report is away', async () => {
    renderControl()
    openAndSend()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('tells the member when the send fails, and keeps their words', async () => {
    send.mockImplementation(async () => {
      throw new Error('nope')
    })
    renderControl()
    openAndSend('words I do not want to retype')
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('textbox')).toHaveValue('words I do not want to retype')
  })
})

describe('a signed-out member', () => {
  it('still sees the ⋯ control', () => {
    renderControl({ loggedIn: false })
    expect(screen.getByRole('button', { name: 'More options' })).toBeInTheDocument()
  })

  it('is sent to sign-in rather than to a dead end', () => {
    renderControl({ loggedIn: false })
    fireEvent.click(screen.getByRole('button', { name: 'More options' }))
    const item = screen.getByRole('menuitem', { name: /report to the operator/i })
    expect(item).toHaveAttribute('href', expect.stringContaining('/auth/login'))
    expect(item).not.toBeDisabled()
  })

  it('comes back to the Page it was on after signing in', () => {
    renderControl({ loggedIn: false, returnTo: '/p/ca/sacramento/g/oak-park-sourdough' })
    fireEvent.click(screen.getByRole('button', { name: 'More options' }))
    const href = screen
      .getByRole('menuitem', { name: /report to the operator/i })
      .getAttribute('href')!
    expect(decodeURIComponent(href)).toContain('/p/ca/sacramento/g/oak-park-sourdough')
  })

  it('never reaches the send path', () => {
    renderControl({ loggedIn: false })
    fireEvent.click(screen.getByRole('button', { name: 'More options' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /report to the operator/i }))
    expect(send).not.toHaveBeenCalled()
  })
})
