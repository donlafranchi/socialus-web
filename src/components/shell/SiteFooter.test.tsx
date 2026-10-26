import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { SiteFooter } from './SiteFooter'
import { COPY } from '@/lib/copy'

vi.mock('next/navigation', () => ({ usePathname: () => '/explore' }))
const prefetch = vi.fn()
vi.mock('next/link', () => ({
  default: ({ children, prefetch: p, ...rest }: { children: React.ReactNode; prefetch?: boolean }) => {
    prefetch(rest, p)
    return <a {...(rest as object)}>{children}</a>
  },
}))

describe('SiteFooter', () => {
  // #978
  it('never prefetches its links: they sit on every page and queue ahead of the tapped card', () => {
    render(<SiteFooter />)
    expect(prefetch).toHaveBeenCalled()
    for (const [, p] of prefetch.mock.calls) expect(p).toBe(false)
  })
  // Ethos decency line: the ethos's thanks sits in the footer at every width.
  it('thanks members for being decent, on the phone row and the full row', () => {
    const { container } = render(<SiteFooter />)
    const getByTestId = (id: string) => container.querySelector(`[data-testid="${id}"]`)!
    expect(getByTestId('footer-decency').textContent).toBe(COPY.decencyThanks)
    expect(getByTestId('footer-decency-full').textContent).toBe(COPY.decencyThanks)
  })
})
