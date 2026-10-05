// The owner surface. Don, 2026-09-18: opening their page should open another
// surface where these things can be changed and their tools become available.

import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { OwnerBar } from './OwnerBar'
import { PageEditorProvider } from './edit/PageEditor'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {} }) }))
const EDITOR = {
  groupId: 'g1', pagePath: '/g/x', memberId: 'm1', name: 'N', description: '', photoUrl: null,
  socialLinks: {}, tags: ['t'], contact: { phone: null, hours: null }, contactOn: true, addressLabel: null, kind: 'business' as const,
}

afterEach(cleanup)

describe('the owner bar', () => {
  // #302 — Don, 2026-10-04: one Edit toggle on the Page itself, not a link to
  // a separate long form (Apple Contacts' Edit/Done).
  it('offers an Edit toggle and Announce, in plain sight', () => {
    render(
      <PageEditorProvider initial={EDITOR} onSave={async () => ({ ok: true })}>
        <OwnerBar pagePath="/g/oak-park-sourdough-7k3x8m" />
      </PageEditorProvider>,
    )
    expect(screen.getByRole('button', { name: 'Edit' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByRole('link', { name: /edit/i })).toBeNull()
    expect(screen.getByTestId('owner-announce')).toBeInTheDocument()
  })

  it('Announce is secondary: the composer has the one primary', () => {
    render(<OwnerBar pagePath="/g/x-abc123" />)
    expect(screen.getByTestId('owner-announce').className).not.toMatch(/btn-primary/)
  })

  it('says whose it is and that nobody else sees it', () => {
    render(<OwnerBar pagePath="/g/x-abc123" />)
    expect(screen.getByTestId('owner-bar')).toHaveTextContent(/only you see this/i)
  })
})
