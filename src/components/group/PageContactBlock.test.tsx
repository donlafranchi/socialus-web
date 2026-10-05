// #293 — the contact block: tap-to-call and the week's hours, today first.

import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
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
