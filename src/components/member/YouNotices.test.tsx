import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { YouNotices } from './YouNotices'

afterEach(cleanup)

const notice = { id: 'n1', message: 'Someone reported the photo on Oak Park Bakery as "Spam", so we\'ve hidden it.', createdAt: '2026-10-07T12:00:00Z' }

// [guards F078.3 partial: the in-app message; the content is the handler's]
describe('F078 — YouNotices', () => {
  it('shows each notice the poster has been sent', () => {
    render(<YouNotices notices={[notice]} />)
    expect(screen.getByText(notice.message)).toBeInTheDocument()
  })

  it('renders nothing when there is nothing to say', () => {
    const { container } = render(<YouNotices notices={[]} />)
    expect(container).toBeEmptyDOMElement()
  })
})
