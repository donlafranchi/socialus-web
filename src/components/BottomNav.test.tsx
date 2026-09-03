// T112 — Bottom nav visual refresh (thesis §2 compliance).
// Trace: product/ui/design-research-thesis.md § 2; scenario F046 "Nav visual treatment matches thesis spec".

import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { BottomNav } from './BottomNav'
import { NavVisibilityContext } from './NavVisibilityProvider'

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
  it('renders exactly three tabs: Home, Explore, You', () => {
    render(<BottomNav />)
    const links = within(screen.getByTestId('bottom-nav')).getAllByRole('link')
    expect(links.map((l) => l.textContent)).toEqual(['Home', 'Explore', 'You'])
  })

  it('exposes a named navigation landmark', () => {
    render(<BottomNav />)
    expect(screen.getByRole('navigation', { name: 'Primary' })).toBe(
      screen.getByTestId('bottom-nav'),
    )
  })

  it('bar is 44px tall', () => {
    render(<BottomNav />)
    expect(bar().className).toContain('h-11')
    expect(bar().className).not.toContain('h-16')
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
    const inactive = screen.getByRole('link', { name: 'Home' })
    expect(inactive).toHaveAttribute('data-active', 'false')
    expect(inactive.className).toContain('text-[var(--color-nav-inactive)]')
  })

  it('each tab spans the full 44px bar height as a touch target', () => {
    render(<BottomNav />)
    const link = screen.getByRole('link', { name: 'Home' })
    expect(link.className).toContain('h-full')
    expect(link.parentElement!.className).toContain('items-stretch')
  })

  it('labels are 9px medium sitting 3px below the icon', () => {
    render(<BottomNav />)
    const link = screen.getByRole('link', { name: 'Home' })
    expect(link.className).toContain('text-[9px]')
    expect(link.className).toContain('font-medium')
    expect(link.className).toContain('gap-[3px]')
  })

  it('icons are 20px at 1.5 stroke weight on every tab', () => {
    pathname.current = '/explore'
    render(<BottomNav />)
    const icons = screen.getByTestId('bottom-nav').querySelectorAll('svg')
    expect(icons).toHaveLength(3)
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
    expect(svgOf('Home').getAttribute('fill')).toBe('none')
    expect(svgOf('You').getAttribute('fill')).toBe('none')
  })

  it('re-tapping the active tab scrolls to top instead of navigating', () => {
    const scrollTo = vi.fn()
    vi.stubGlobal('scrollTo', scrollTo)
    render(<BottomNav />)
    screen.getByRole('link', { name: 'Home' }).click()
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
