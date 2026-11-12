// `/` and `/join` — the one line (Don, 2026-11-06): "Locals, finding and supporting locals." The
// landing page and /join say it and nothing competing (#1271).

import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import HomeLanding from './page'
import JoinPage from './join/page'
import { HOME, HOME_TODO, MESSAGE } from '@/lib/home-landing'
import { navHidden } from '@/components/shell/nav-hidden'

// The pitch loads its webfont through next/font/local, which needs a Next build.
vi.mock('next/font/local', () => ({ default: () => ({ variable: '--font-landing', className: 'aime' }) }))

afterEach(cleanup)

describe.each([
  ['the front door', HomeLanding],
  ['/join', JoinPage],
])('%s', (_name, Page) => {
  it('leads with the one line, and it is the only heading', () => {
    render(<Page />)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Locals, finding and supporting locals.')
    expect(screen.getAllByRole('heading')).toHaveLength(1)
  })

  it('carries Don’s sentence under it and nothing competing', () => {
    const { container } = render(<Page />)
    expect(screen.getByText(HOME.hero.body)).toBeTruthy()
    const text = container.textContent!
    for (const gone of ['Online is cool', 'Real life is better', 'Made to work for you', 'Somewhere to go', 'Sacramento', 'farmers market', 'vendor'])
      expect(text).not.toContain(gone)
  })

  it('has exactly one account action, the standard sign-up (F085.1), and a way to look around', () => {
    const { container } = render(<Page />)
    const ctas = screen.getAllByRole('link', { name: HOME_TODO.primaryCta })
    expect(ctas.length).toBe(2)
    for (const a of ctas) expect(a.getAttribute('href')).toBe('/auth/login')
    const others = [...container.querySelectorAll('a')].map((a) => a.getAttribute('href'))
    // A visitor can read everything (the PM, 2026-11-12): looking around is not an account action.
    expect(screen.getByRole('link', { name: HOME_TODO.lookAround }).getAttribute('href')).toBe('/explore')
    expect(new Set(others)).toEqual(new Set(['/', '/auth/login', '/explore', ...HOME.footer.links.map((l) => l.href)]))
  })

  it('names no kind of person (F085.6)', () => {
    const { container } = render(<Page />)
    const img = container.querySelector('img')!
    expect((container.textContent + img.alt).toLowerCase()).not.toMatch(/neighbo|vendor|customer|creator|patron|seller|buyer/)
  })

  it('the illustration says what it shows', () => {
    const { container } = render(<Page />)
    const imgs = [...container.querySelectorAll('img')]
    expect(imgs.length).toBe(1)
    expect(imgs[0].getAttribute('alt')!.length).toBeGreaterThan(20)
  })

  it('footer links go to real pages, and the footer says the line', () => {
    const { container } = render(<Page />)
    for (const l of HOME.footer.links) expect(screen.getByRole('link', { name: l.label }).getAttribute('href')).toBe(l.href)
    expect(container.querySelector('footer')!.textContent).toContain(MESSAGE)
    expect(container.querySelector('footer')!.textContent).not.toContain('Contact')
  })
})

it('hides the app’s own nav on the pitch only', () => {
  expect(navHidden('/')).toBe(true)
  expect(navHidden('/join')).toBe(true)
  expect(navHidden('/joinery')).toBe(false)
  expect(navHidden('/explore')).toBe(false)
})
