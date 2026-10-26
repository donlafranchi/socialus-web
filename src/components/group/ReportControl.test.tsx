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

  it('opens to exactly one item — Report this Page', () => {
    renderControl()
    fireEvent.click(screen.getByRole('button', { name: 'More options' }))
    const items = screen.getAllByRole('menuitem')
    expect(items).toHaveLength(1)
    expect(items[0]).toHaveTextContent('Report this Page')
  })

  // #625 — on a Page, its own words are reportable on their own; the photo keeps its own item.
  it("on a Page, offers the Page's name or description and its photo as two reports", async () => {
    renderControl({ wordsReportable: true })
    fireEvent.click(screen.getByRole('button', { name: 'More options' }))
    const items = screen.getAllByRole('menuitem').map((i) => i.textContent)
    expect(items).toEqual(['Report this Page', "Report this Page's photo"])
    fireEvent.click(screen.getByRole('menuitem', { name: 'Report this Page' }))
    fireEvent.click(await screen.findByRole('radio', { name: 'Harassment' }))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Rude name.' } })
    fireEvent.click(screen.getByRole('button', { name: /send/i }))
    await waitFor(() => expect(send).toHaveBeenCalledWith(expect.objectContaining({ subjectKind: 'page_words', subjectId: 'grp-1' })))
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
    fireEvent.click(screen.getByRole('menuitem', { name: /report this/i }))
  }

  it('opens on the PM\'s line, ahead of the reasons', () => {
    renderControl()
    openSheet()
    expect(screen.getByTestId('report-tolerance')).toHaveTextContent("We won't tolerate abusive or harmful content.")
    expect(screen.getByRole('dialog')).toHaveTextContent('Thanks for helping us all be good to one another.')
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

  it('moves focus into the sheet on open, but not into the box (it would scroll the intro away)', async () => {
    renderControl()
    openSheet()
    await waitFor(() => {
      expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true)
    })
    expect(document.activeElement).not.toBe(screen.getByRole('textbox'))
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

  it('traps Tab inside the sheet', async () => {
    renderControl()
    openSheet()
    const dialog = screen.getByRole('dialog')
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true))
    const focusable = Array.from(
      dialog.querySelectorAll<HTMLElement>('button:not([disabled]), input, textarea, [href]'),
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
    fireEvent.click(screen.getByRole('menuitem', { name: /report this/i }))
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
    expect(screen.getByRole('radio', { name: /sensitive content.*children.*animals.*speak up for themselves/i })).toBeInTheDocument()
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

  // [guards F078.11 partial: the sent line, by whether a courtesy notice goes first (#627)]
  it('confirms an ordinary report as a courtesy notice to the owner', async () => {
    renderControl()
    openAndSend()
    const status = await screen.findByRole('status')
    expect(status).toHaveTextContent('Thanks for looking out for everyone.')
    expect(status).toHaveTextContent(/courtesy notice/i)
  })

  it('confirms threat of harm as sent to a person from our team', async () => {
    renderControl()
    openAndSend('x', /threat of harm/i)
    expect(await screen.findByRole('status')).toHaveTextContent("It's being sent to a person from our team.")
  })

  // [guards F078.11 partial: no developer string reaches a member (#703)]
  it('shows the plain words a refused send comes back with, and keeps what was typed', async () => {
    send.mockImplementation((async () => ({ ok: false as const, message: "You've already reported this one. We have it." })) as never)
    renderControl()
    openAndSend('my words')
    expect(await screen.findByRole('alert')).toHaveTextContent("You've already reported this one. We have it.")
    expect(screen.getByRole('textbox')).toHaveValue('my words')
    expect(screen.queryByTestId('report-sent')).toBeNull()
  })

  it('shows plain words when the send itself blows up, never the error text', async () => {
    send.mockImplementation((async () => { throw new Error('report.create: boom') }) as never)
    renderControl()
    openAndSend('my words')
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).not.toMatch(/report\.create|boom/)
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

  it('is told why first: a "Sign in to report this" prompt, not the bare sign-in page', () => {
    renderControl({ loggedIn: false })
    fireEvent.click(screen.getByRole('button', { name: 'More options' }))
    const item = screen.getByRole('menuitem', { name: /report this/i })
    expect(item).not.toHaveAttribute('href')
    fireEvent.click(item)
    expect(screen.getByRole('dialog', { name: 'Sign in to report this' })).toBeInTheDocument()
    expect(screen.getByTestId('sign-in-prompt-continue')).toHaveAttribute('href', expect.stringContaining('/auth/login'))
  })

  it('comes back to the Page it was on after signing in', () => {
    renderControl({ loggedIn: false, returnTo: '/p/ca/sacramento/g/oak-park-sourdough' })
    fireEvent.click(screen.getByRole('button', { name: 'More options' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /report this/i }))
    const href = screen.getByTestId('sign-in-prompt-continue').getAttribute('href')!
    expect(decodeURIComponent(href)).toContain('/p/ca/sacramento/g/oak-park-sourdough')
  })

  it('never reaches the send path', () => {
    renderControl({ loggedIn: false })
    fireEvent.click(screen.getByRole('button', { name: 'More options' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /report this/i }))
    expect(send).not.toHaveBeenCalled()
  })
})

// F099 criterion 8 — the control reports whichever image it was given.
describe('which image is reported', () => {
  const sendIt = () => {
    fireEvent.click(screen.getByRole('button', { name: 'More options' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /report this/i }))
    fireEvent.click(screen.getByRole('radio', { name: /^spam$/i }))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'No.' } })
    fireEvent.click(screen.getByRole('button', { name: /send/i }))
  }

  // [guards F099.8]
  it('sends the subject kind it was given', async () => {
    renderControl({ subjectKind: 'post_photo' })
    sendIt()
    await waitFor(() => expect(send).toHaveBeenCalledWith(expect.objectContaining({ subjectKind: 'post_photo', subjectId: 'grp-1' })))
  })

  it('sends none for the Page photo, as before', async () => {
    renderControl()
    sendIt()
    await waitFor(() => expect(send).toHaveBeenCalled())
    expect((send.mock.calls[0] as unknown as [{ subjectKind?: string }])[0].subjectKind).toBeUndefined()
  })
})

// F102 criterion 10 — kindly, before sending.
describe('F102 — threat of harm', () => {
  // [guards F102.10]
  it('tells the reporter to call 911 if someone is in danger now, once that reason is picked', () => {
    render(<ReportControl subjectId="g1" subjectLabel="Oak Park Bakery" loggedIn onSend={vi.fn(async () => ({ ok: true as const }))} />)
    fireEvent.click(screen.getByRole('button', { name: /more options/i }))
    fireEvent.click(screen.getByRole('menuitem', { name: /report this/i }))
    expect(screen.queryByTestId('report-911')).toBeNull()
    fireEvent.click(screen.getByLabelText('Threat of harm'))
    expect(screen.getByTestId('report-911')).toHaveTextContent(/911/)
    fireEvent.click(screen.getByLabelText('Spam'))
    expect(screen.queryByTestId('report-911')).toBeNull()
  })
})

// #627 — before sending, the reporter is told kindly what happens next, with no numbers.
describe('F078 — what happens next, said before Send', () => {
  const open = () => {
    render(<ReportControl subjectId="g1" subjectLabel="Oak Park Bakery" loggedIn onSend={vi.fn(async () => ({ ok: true as const }))} />)
    fireEvent.click(screen.getByRole('button', { name: /more options/i }))
    fireEvent.click(screen.getByRole('menuitem', { name: /report this/i }))
  }

  it('an ordinary reason: the owner gets a courtesy notice first, we do not share who you are, do not misuse reports', () => {
    open()
    const line = screen.getByTestId('report-misuse')
    expect(line).toHaveTextContent("We'll first send the page owner a courtesy notice so they can fix it.")
    expect(line).toHaveTextContent("We don't share who you are.")
    expect(line).toHaveTextContent("Please don't misuse reports.")
    expect(line.textContent).not.toMatch(/\d|three|reject/i)
  })

  it('threat of harm and sensitive content say they skip the courtesy notice', () => {
    open()
    for (const reason of ['Threat of harm', /^Sensitive content/]) {
      fireEvent.click(screen.getByRole('radio', { name: reason }))
      const line = screen.getByTestId('report-misuse')
      expect(line).toHaveTextContent(/skip the courtesy notice/i)
      expect(line).toHaveTextContent("We don't share who you are.")
      expect(line).toHaveTextContent("Please don't misuse reports.")
    }
    fireEvent.click(screen.getByRole('radio', { name: 'Spam' }))
    expect(screen.getByTestId('report-misuse')).toHaveTextContent(/courtesy notice so they can fix it/i)
  })
})
