// T112 — Bottom nav visual refresh (thesis §2 compliance).
// Trace: product/ui/design-research-thesis.md § 2; scenario F046 "Nav visual treatment matches thesis spec".

import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { BottomNav, TopNavDesktop } from './BottomNav'
import { NavVisibilityContext } from './NavVisibilityProvider'

// The nav's auth-aware parts build a Supabase browser client and need project
// env vars. This file tests nav structure, not auth — which is also why
// TopNavDesktop had no test before now.
//
// F086 added two more of them: NavYouBadge in the desktop nav, and useAuth in
// the You tab's icon. Both are stubbed for the same reason as AuthCtaButtons,
// and their own behaviour is covered in YouBadge.test.tsx and
// PersonMark.test.tsx.
vi.mock('./AuthCtaButtons', () => ({ AuthCtaButtons: () => null }))
vi.mock('./NavYouBadge', () => ({ NavYouBadge: () => null }))
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: null, loading: false }) }))

const pathname = { current: '/' }
vi.mock('next/navigation', () => ({
  usePathname: () => pathname.current,
  useRouter: () => ({ push: vi.fn() }),
}))

afterEach(() => {
  cleanup()
  pathname.current = '/'
})

const bar = () => screen.getByTestId('bottom-nav').querySelector('ul')!

describe('BottomNav — thesis §2 visual spec', () => {
  // Home is paused (2026-09-17) — off the site, not deleted. Two tabs now.
  it('renders exactly two tabs: Explore, You', () => {
    render(<BottomNav />)
    const tabs = within(screen.getByTestId('bottom-nav'))
      .getAllByRole('link')
      .filter((l) => l.hasAttribute('data-active'))
    expect(tabs.map((l) => l.textContent)).toEqual(['Explore', 'You'])
  })

  it('exposes a named navigation landmark', () => {
    render(<BottomNav />)
    expect(screen.getByRole('navigation', { name: 'Primary' })).toBe(
      screen.getByTestId('bottom-nav'),
    )
  })

  // #296 — the design's bottom nav is 56px (--nav-bottom-h).
  it('bar is 56px tall', () => {
    render(<BottomNav />)
    expect(bar().className).toContain('h-nav-bottom')
    expect(bar().className).not.toContain('h-11')
  })

  it('applies safe-area bottom padding below the bar', () => {
    render(<BottomNav />)
    expect(screen.getByTestId('bottom-nav')).toHaveStyle({
      paddingBottom: 'env(safe-area-inset-bottom)',
    })
  })

  it('background is opaque white with a hairline top border and no blur', () => {
    render(<BottomNav />)
    const nav = screen.getByTestId('bottom-nav')
    expect(nav.className).toContain('bg-white')
    expect(nav.className).toContain('border-t')
    expect(nav.className).toContain('border-[var(--color-nav-border)]')
    expect(nav.className).not.toContain('blur')
    expect(nav.className).not.toMatch(/bg-white\/\d+/) // no opacity modifier
  })

  it('stays hidden at the desktop breakpoint', () => {
    render(<BottomNav />)
    expect(screen.getByTestId('bottom-nav').className).toContain('md:hidden')
  })

  it('active tab renders in charcoal, never in the brand accent', () => {
    pathname.current = '/explore'
    render(<BottomNav />)
    const active = screen.getByRole('link', { name: 'Explore' })
    expect(active).toHaveAttribute('data-active', 'true')
    expect(active.className).toContain('text-[var(--color-charcoal)]')
    expect(active.className).not.toContain('--color-accent')
  })

  it('inactive tabs render in the muted nav gray', () => {
    pathname.current = '/explore'
    render(<BottomNav />)
    const inactive = screen.getByRole('link', { name: 'You' })
    expect(inactive).toHaveAttribute('data-active', 'false')
    expect(inactive.className).toContain('text-[var(--color-nav-inactive)]')
  })

  it('each tab spans the full bar height as a touch target', () => {
    render(<BottomNav />)
    const link = screen.getByRole('link', { name: 'You' })
    expect(link.className).toContain('h-full')
    expect(link.parentElement!.className).toContain('items-stretch')
  })

  // #296 — 12px is the type floor; 9px labels are gone.
  it('labels are micro (12px) medium, just below the icon', () => {
    render(<BottomNav />)
    const link = screen.getByRole('link', { name: 'You' })
    expect(link.className).toContain('text-micro')
    expect(link.className).toContain('font-medium')
    expect(link.className).not.toMatch(/text-\[\d+px\]/)
  })

  it('icons are 20px at 1.5 stroke weight on every tab', () => {
    pathname.current = '/explore'
    render(<BottomNav />)
    const icons = screen.getByTestId('bottom-nav').querySelectorAll('svg')
    expect(icons).toHaveLength(3) // two tabs + the create action (Home paused)
    icons.forEach((svg) => {
      expect(svg.getAttribute('width')).toBe('20')
      expect(svg.getAttribute('height')).toBe('20')
      expect(svg.getAttribute('stroke-width')).toBe('1.5')
    })
  })

  it('active icon is filled and inactive icons are outlined', () => {
    pathname.current = '/explore'
    render(<BottomNav />)
    const svgOf = (name: string) =>
      screen.getByRole('link', { name }).querySelector('svg')!
    expect(svgOf('Explore').getAttribute('fill')).toBe('currentColor')
    expect(svgOf('You').getAttribute('fill')).toBe('none')
  })

  it('re-tapping the active tab scrolls to top instead of navigating', () => {
    // Explicit now: the suite default is '/', which matched the Home tab. With
    // Home paused nothing matches '/' — and nothing should, since '/' redirects
    // to Explore and the nav never renders there.
    pathname.current = '/explore'
    const scrollTo = vi.fn()
    vi.stubGlobal('scrollTo', scrollTo)
    render(<BottomNav />)
    // The ACTIVE tab — pathname is /explore in this suite.
    screen.getByRole('link', { name: 'Explore' }).click()
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' })
    vi.unstubAllGlobals()
  })
})

// T113 — scroll-to-hide behavior. Trace: scenario F046.
describe('BottomNav — scroll-to-hide', () => {
  const renderWithVisibility = (visible: boolean) =>
    render(
      <NavVisibilityContext.Provider value={visible}>
        <BottomNav />
      </NavVisibilityContext.Provider>,
    )

  it('sits at rest on screen when the nav is visible', () => {
    renderWithVisibility(true)
    const nav = screen.getByTestId('bottom-nav')
    expect(nav.className).toContain('translate-y-0')
    expect(nav.className).not.toContain('translate-y-full')
    expect(nav).toHaveAttribute('data-nav-visible', 'true')
  })

  it('slides fully off-screen when the nav is hidden', () => {
    renderWithVisibility(false)
    const nav = screen.getByTestId('bottom-nav')
    expect(nav.className).toContain('translate-y-full')
    expect(nav).toHaveAttribute('data-nav-visible', 'false')
  })

  it('is visible by default with no provider — no flash of hidden nav on load', () => {
    render(<BottomNav />)
    expect(screen.getByTestId('bottom-nav')).toHaveAttribute('data-nav-visible', 'true')
  })

  it('transitions the transform over ~200ms ease-out', () => {
    renderWithVisibility(true)
    const cls = screen.getByTestId('bottom-nav').className
    expect(cls).toContain('transition-transform')
    expect(cls).toContain('duration-200')
    expect(cls).toContain('ease-out')
  })

  it('drops the animation under prefers-reduced-motion', () => {
    renderWithVisibility(true)
    expect(screen.getByTestId('bottom-nav').className).toContain('motion-reduce:transition-none')
  })

  it('stays out of the document flow so content never jumps', () => {
    renderWithVisibility(false)
    const cls = screen.getByTestId('bottom-nav').className
    expect(cls).toContain('fixed')
    expect(cls).toContain('bottom-0')
  })

  it('does not translate at the desktop breakpoint', () => {
    renderWithVisibility(false)
    expect(screen.getByTestId('bottom-nav').className).toContain('md:translate-y-0')
  })

  it('returns to screen when a nav link takes keyboard focus', () => {
    renderWithVisibility(false)
    expect(screen.getByTestId('bottom-nav').className).toContain('focus-within:translate-y-0')
  })
})

// T158 (#55) — the nav gains a create action.
//
// The surviving half of the rescinded two-tab decision. Create is first class:
// a persistent `+` in the nav, not a button buried on You. What it must NOT be
// is a fourth tab — it navigates to a destination that is not a peer of the
// three, and announcing it as a tab tells a screen-reader user the nav has
// four sections when it has three.
describe('BottomNav — create action (T158)', () => {
  const create = () => screen.getByTestId('nav-create')

  it('renders a create action in the bar', () => {
    render(<BottomNav />)
    expect(create()).toBeInTheDocument()
    expect(within(screen.getByTestId('bottom-nav')).getByText('Create')).toBeInTheDocument()
  })

  // #274 — /you/sell sent anyone without a business Page back to /you, whose
  // empty state said "Tap Create": a loop. Create now lands where the flow
  // opens at once.
  it('lands on a create flow that opens at once', () => {
    render(<BottomNav />)
    expect(create()).toHaveAttribute('href', '/create')
  })

  it('is a link, never a tab', () => {
    // No ARIA tab roles in this bar — `role="tab"` is only valid inside a
    // `tablist`, and a nav of links is the right pattern. What makes the
    // create action not-a-tab is that it carries neither marker a tab uses to
    // say "you are here".
    render(<BottomNav />)
    expect(create()).not.toHaveAttribute('role')
    expect(create()).not.toHaveAttribute('aria-current')
    expect(create()).not.toHaveAttribute('data-active')
  })

  it('carries no aria-current on the route it points at, either', () => {
    // A tab on its own route gets aria-current="page". The create action must
    // not, anywhere — it is not a section of the nav.
    pathname.current = '/you/sell'
    render(<BottomNav />)
    expect(create()).not.toHaveAttribute('aria-current')
  })

  it('does not displace a tab — both still render beside it', () => {
    render(<BottomNav />)
    const tabs = within(screen.getByTestId('bottom-nav'))
      .getAllByRole('link')
      .filter((l) => l.hasAttribute('data-active'))
    expect(tabs.map((t) => t.textContent)).toEqual(['Explore', 'You'])
    expect(tabs).not.toContain(create())
  })

  it('sits between the tabs rather than at either end', () => {
    render(<BottomNav />)
    const cells = Array.from(bar().children)
    const i = cells.findIndex((c) => c.contains(create()))
    expect(i).toBeGreaterThan(0)
    expect(i).toBeLessThan(cells.length - 1)
  })

  it('is keyboard reachable and carries an accessible name', () => {
    render(<BottomNav />)
    expect(create()).toHaveAccessibleName(/create/i)
    expect(create().tagName).toBe('A')
    expect(create()).not.toHaveAttribute('tabindex', '-1')
  })

  it('spans the full bar height, like every other touch target', () => {
    render(<BottomNav />)
    expect(create().className).toContain('h-full')
    expect(create().parentElement!.className).toContain('items-stretch')
  })

  it('matches the tab type scale — micro medium, below a 20px/1.5 icon', () => {
    render(<BottomNav />)
    expect(create().className).toContain('text-micro')
    expect(create().className).toContain('font-medium')
    const svg = create().querySelector('svg')!
    expect(svg.getAttribute('width')).toBe('20')
    expect(svg.getAttribute('stroke-width')).toBe('1.5')
  })

  it('never renders in the active-tab treatment', () => {
    // Peer geometry, not peer state. The charcoal active colour belongs to a
    // tab you are on; the create action is never "on".
    pathname.current = '/you/sell'
    render(<BottomNav />)
    expect(create().className).not.toContain('text-[var(--color-charcoal)]')
  })
})

describe('TopNavDesktop — create action (T158)', () => {
  const create = () => screen.getByTestId('desktop-nav-create')

  it('carries the same create action as the bottom bar', () => {
    render(<TopNavDesktop />)
    expect(create()).toHaveAttribute('href', '/create')
    expect(create()).toHaveAccessibleName(/create/i)
  })

  it('is a link, never a tab, here too', () => {
    pathname.current = '/you/sell'
    render(<TopNavDesktop />)
    expect(create()).not.toHaveAttribute('aria-current')
  })

  it('does not displace the two destinations', () => {
    render(<TopNavDesktop />)
    const nav = screen.getByTestId('top-nav-desktop')
    for (const name of ['Explore', 'You']) {
      expect(within(nav).getByRole('link', { name })).toBeInTheDocument()
    }
  })
})

describe('#296 — where the nav is hidden', () => {
  for (const path of ['/auth/login', '/auth/password', '/onboarding', '/admin/reports']) {
    it(`hides both navs on ${path}`, () => {
      pathname.current = path
      const { container } = render(
        <>
          <BottomNav />
          <TopNavDesktop />
        </>,
      )
      expect(container).toBeEmptyDOMElement()
    })
  }

  it('shows them everywhere else', () => {
    pathname.current = '/explore'
    render(
      <>
        <BottomNav />
        <TopNavDesktop />
      </>,
    )
    expect(screen.getByTestId('bottom-nav')).toBeInTheDocument()
    expect(screen.getByTestId('top-nav-desktop')).toBeInTheDocument()
  })
})

describe('#296 — the header at 744 and up', () => {
  it('is 64px and orders Explore, then Create', () => {
    pathname.current = '/explore'
    render(<TopNavDesktop />)
    const nav = screen.getByTestId('top-nav-desktop')
    expect(nav.className).toContain('h-nav-top')
    const labels = within(nav).getAllByRole('link').map((l) => l.textContent)
    expect(labels.indexOf('Create')).toBeGreaterThan(labels.indexOf('Explore'))
    expect(labels.indexOf('You')).toBeGreaterThan(labels.indexOf('Create'))
  })
})
