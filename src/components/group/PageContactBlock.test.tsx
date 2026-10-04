// #293 — the contact block: tap-to-call and the week's hours, today first.

import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, within, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { PageContactBlock } from './PageContactBlock'

afterEach(cleanup)
const THURSDAY = new Date('2026-10-01T18:00:00Z')

describe('#293 — the contact block', () => {
  it('offers the phone as tap-to-call', () => {
    render(<PageContactBlock contact={{ phone: '+19165550142', hours: null }} now={THURSDAY} />)
    const call = screen.getByRole('link', { name: /\(916\) 555-0142/ })
    expect(call).toHaveAttribute('href', 'tel:+19165550142')
  })

  it('lists the week from today, marking today', () => {
    render(
      <PageContactBlock
        contact={{ phone: null, hours: { thu: [{ open: '07:00', close: '15:00' }], fri: [{ open: '08:00', close: '12:30' }] } }}
        now={THURSDAY}
      />,
    )
    const rows = screen.getAllByTestId('page-hours-day')
    expect(rows[0]).toHaveTextContent(/Today.*7am–3pm/)
    expect(rows[1]).toHaveTextContent(/Friday.*8am–12:30pm/)
    expect(rows[2]).toHaveTextContent(/Saturday.*Closed/)
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('renders nothing when the owner gave neither', () => {
    const { container } = render(<PageContactBlock contact={{ phone: null, hours: null }} now={THURSDAY} />)
    expect(container).toBeEmptyDOMElement()
  })
})

// #344 — compact: the hours collapse to one line and open inline, no modal.
describe('#344 — collapsed hours', () => {
  const hours = { thu: [{ open: '07:00', close: '15:00' }], fri: [{ open: '08:00', close: '12:30' }] }

  it('show one line, open now and when it closes, collapsed by default', () => {
    render(<PageContactBlock contact={{ phone: null, hours }} now={THURSDAY} />)
    const disclosure = screen.getByTestId('page-hours')
    expect(disclosure.tagName).toBe('DETAILS')
    expect(disclosure).not.toHaveAttribute('open')
    expect(within(disclosure).getByTestId('page-hours-summary')).toHaveTextContent('Open now · Closes 3pm')
  })

  it('say when it next opens when closed', () => {
    render(<PageContactBlock contact={{ phone: null, hours }} now={new Date('2026-10-01T23:30:00Z')} />)
    expect(screen.getByTestId('page-hours-summary')).toHaveTextContent('Closed · Opens 8am Fri')
  })

  it('open to the week inline, today first and marked as today', () => {
    render(<PageContactBlock contact={{ phone: null, hours }} now={THURSDAY} />)
    fireEvent.click(screen.getByTestId('page-hours-summary'))
    expect(screen.getByTestId('page-hours')).toHaveAttribute('open')
    const rows = screen.getAllByTestId('page-hours-day')
    expect(rows[0]).toHaveAttribute('aria-current', 'date')
    expect(rows[1]).not.toHaveAttribute('aria-current')
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
