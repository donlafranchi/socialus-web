import { describe, it, expect, vi, afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, within, cleanup } from '@testing-library/react'
import { STATUS_PAGE_URL } from '@/lib/status-page'
import { SiteFooter } from './SiteFooter'

vi.mock('next/navigation', () => ({ usePathname: () => '/explore' }))
const prefetch = vi.fn()
vi.mock('next/link', () => ({
  default: ({ children, prefetch: p, ...rest }: { children: React.ReactNode; prefetch?: boolean }) => {
    prefetch(rest, p)
    return <a {...(rest as object)}>{children}</a>
  },
}))

afterEach(cleanup)

describe('SiteFooter', () => {
  // #978: pinned here, no scenario criterion behind it
  it('never prefetches its links: they sit on every page and queue ahead of the tapped card', () => {
    render(<SiteFooter />)
    expect(prefetch).toHaveBeenCalled()
    for (const [, p] of prefetch.mock.calls) expect(p).toBe(false)
  })
  // Status lives outside the app, so it answers when the app can't (GitHub, Stripe, Linear footers).
  it('links the public status page, on a phone and at full width, in a new tab', () => {
    const { getByTestId } = render(<SiteFooter />)
    for (const id of ['site-footer-phone', 'site-footer-full']) {
      const a = within(getByTestId(id)).getByRole('link', { name: 'Status' })
      expect(a).toHaveAttribute('href', 'https://stats.uptimerobot.com/11Jx7n72Sp')
      expect(a).toHaveAttribute('target', '_blank')
      expect(a.getAttribute('rel')).toContain('noopener')
    }
    expect(STATUS_PAGE_URL).toBe('https://stats.uptimerobot.com/11Jx7n72Sp')
  })
})
