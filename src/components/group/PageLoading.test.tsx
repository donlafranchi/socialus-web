// #555 — the Page's loading boundary: shown at once, before the server has even found the Page. It carries what the
// card knew (the name, the kind, the photo) when there is a handoff, and the plain outline when there is not.

import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

const { pathname, read } = vi.hoisted(() => ({ pathname: vi.fn(), read: vi.fn() }))
vi.mock('next/navigation', () => ({ usePathname: pathname }))
vi.mock('@/lib/browse/card-handoff', () => ({ readCardForPage: read }))

import { PageLoading } from './PageLoading'

afterEach(cleanup)

describe('PageLoading', () => {
  it('shows the Page\'s name, kind and photo from the card at once', () => {
    pathname.mockReturnValue('/g/abc123')
    read.mockReturnValue({ name: 'Bean Co', kindLine: 'Business', imageUrl: 'https://x.test/a.webp' })
    render(<PageLoading />)
    expect(screen.getByRole('heading', { name: 'Bean Co' })).toBeInTheDocument()
    expect(screen.getByText('Business')).toBeInTheDocument()
    expect(document.querySelector('img')).toHaveAttribute('src', 'https://x.test/a.webp')
    expect(read).toHaveBeenCalledWith('/g/abc123')
  })

  it('with no handoff it is the plain outline, never an empty page', () => {
    pathname.mockReturnValue('/g/abc123')
    read.mockReturnValue(null)
    render(<PageLoading />)
    expect(screen.getByRole('status')).toHaveTextContent(/loading this page/i)
    expect(screen.queryByRole('heading')).toBeNull()
  })

  it('says it is busy, for a screen reader', () => {
    pathname.mockReturnValue('/g/abc123')
    read.mockReturnValue({ name: 'Bean Co' })
    const { container } = render(<PageLoading />)
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull()
  })
})
