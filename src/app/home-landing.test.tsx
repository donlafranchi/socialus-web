// `/` — Don's reviewed copy, word for word, with his open brackets kept visible until answered.

import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import HomeLanding from './page'
import { HOME, HOME_TODO } from '@/lib/home-landing'
import { navHidden } from '@/components/BottomNav'

vi.mock('@/app/landing/actions', () => ({ joinLandingWaitlistAction: vi.fn() }))

afterEach(cleanup)

describe('the front door', () => {
  it('leads with the two-line headline and the primary action', () => {
    render(<HomeLanding />)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(HOME.hero.lines.join(''))
    const ctas = screen.getAllByRole('link', { name: HOME_TODO.primaryCta })
    expect(ctas.length).toBe(3)
    for (const a of ctas) expect(a.getAttribute('href')).toBe('/auth/login')
  })

  it('carries every section heading', () => {
    render(<HomeLanding />)
    for (const t of [...HOME.can.map((c) => c.title), HOME.why.title, HOME.thirdSpaces.title, HOME.launch.title])
      expect(screen.getByRole('heading', { name: t })).toBeTruthy()
  })

  it('every in-page link lands on a section', () => {
    const { container } = render(<HomeLanding />)
    for (const a of container.querySelectorAll('a[href^="#"]')) expect(container.querySelector(a.getAttribute('href')!)).toBeTruthy()
  })

  it('footer links go to real pages', () => {
    render(<HomeLanding />)
    for (const l of HOME.footer.links) expect(screen.getByRole('link', { name: l.label }).getAttribute('href')).toBe(l.href)
  })

  it('hides the app’s own nav and footer', () => {
    expect(navHidden('/')).toBe(true)
    expect(navHidden('/explore')).toBe(false)
  })
})
