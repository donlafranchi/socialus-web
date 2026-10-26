import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { SiteFooter } from './SiteFooter'

vi.mock('next/navigation', () => ({ usePathname: () => '/explore' }))
const prefetch = vi.fn()
vi.mock('next/link', () => ({
  default: ({ children, prefetch: p, ...rest }: { children: React.ReactNode; prefetch?: boolean }) => {
    prefetch(rest, p)
    return <a {...(rest as object)}>{children}</a>
  },
}))

describe('SiteFooter', () => {
  // [guards #978]
  it('never prefetches its links: they sit on every page and queue ahead of the tapped card', () => {
    render(<SiteFooter />)
    expect(prefetch).toHaveBeenCalled()
    for (const [, p] of prefetch.mock.calls) expect(p).toBe(false)
  })
})
