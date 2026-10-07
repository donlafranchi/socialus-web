// #296 — the page shell: footer, not-found, empty/error state, text pages.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

const pathname = { current: '/explore' }
vi.mock('next/navigation', () => ({ usePathname: () => pathname.current }))

import { SiteFooter } from './SiteFooter'
import { EmptyState } from './EmptyState'
import { TextPage } from './TextPage'
import { TEXT_PAGES } from '@/lib/text-pages'

afterEach(() => {
  cleanup()
  pathname.current = '/explore'
})

describe('#296 — the footer', () => {
  it('links About, Terms and Privacy, from 744 up', () => {
    render(<SiteFooter />)
    const footer = screen.getByRole('contentinfo')
    expect(footer.className).toMatch(/\bhidden\b.*\bmd:block\b|\bmd:block\b.*\bhidden\b/)
    for (const [name, href] of [['About', '/about'], ['Terms', '/terms'], ['Privacy', '/privacy']]) {
      expect(screen.getByRole('link', { name })).toHaveAttribute('href', href)
    }
  })

  it('is not on sign-in, onboarding or admin', () => {
    pathname.current = '/auth/login'
    const { container } = render(<SiteFooter />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('#296 — the empty and error state', () => {
  it('says what happened and offers one way on', () => {
    render(<EmptyState title="We couldn't find that" body="It may have moved." action={{ href: '/explore', label: 'Go to Explore' }} />)
    expect(screen.getByRole('heading', { name: "We couldn't find that" })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Go to Explore' })).toHaveAttribute('href', '/explore')
  })
})

describe('#296 — About, Terms and Privacy', () => {
  it('each has a page, and Terms and Privacy are drafts live for the beta (#489)', () => {
    expect(Object.keys(TEXT_PAGES).sort()).toEqual(['about', 'privacy', 'terms'])
    expect(TEXT_PAGES.terms.status).toBe('draft')
    expect(TEXT_PAGES.privacy.status).toBe('draft')
  })

  it('a placeholder says plainly it is not in effect', () => {
    render(<TextPage page={{ slug: 'terms', title: 'Terms', status: 'placeholder', body: [] }} />)
    expect(screen.getByRole('heading', { level: 1, name: 'Terms' })).toBeInTheDocument()
    expect(screen.getByTestId('text-page-placeholder')).toHaveTextContent(/not yet in effect/i)
  })
})

describe('#489 — a draft legal page says it is a draft, and never prints the counsel list', () => {
  it('shows the draft note on Terms and Privacy', () => {
    render(<TextPage page={TEXT_PAGES.terms} />)
    expect(screen.getByTestId('text-page-draft')).toBeInTheDocument()
  })
  it('does not render what counsel must supply', () => {
    render(<TextPage page={TEXT_PAGES.privacy} />)
    for (const item of TEXT_PAGES.privacy.counsel ?? []) expect(screen.queryByText(item)).toBeNull()
  })
  it('About carries no draft note', () => {
    render(<TextPage page={TEXT_PAGES.about} />)
    expect(screen.queryByTestId('text-page-draft')).toBeNull()
  })
})
