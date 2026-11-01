// `/` — Don's reviewed copy, word for word, the copywriter's final (2026-10-31); pending bits left out with a TODO.

import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import HomeLanding from './page'
import { HOME, HOME_TODO } from '@/lib/home-landing'
import { navHidden } from '@/components/shell/nav-hidden'

// page.tsx loads its webfont through next/font/local, which needs a Next build.
vi.mock('next/font/local', () => ({ default: () => ({ variable: '--font-landing', className: 'aime' }) }))

afterEach(cleanup)

describe('the front door', () => {
  it('leads with the two-line headline and the primary action', () => {
    render(<HomeLanding />)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(HOME.hero.lines.join(''))
    const ctas = screen.getAllByRole('link', { name: HOME_TODO.primaryCta })
    expect(ctas.length).toBe(3)
    for (const a of ctas) expect(a.getAttribute('href')).toBe('/auth/login')
  })

  it('carries Don’s 2026-11-01 copy: Why SocialUs, Third spaces, the launch line, the hobby sentence', () => {
    render(<HomeLanding />)
    expect(screen.getByRole('heading', { name: 'Made to work for you. Not the other way around.' })).toBeTruthy()
    expect(screen.getByText(/rather than keeping you in the app\.$/)).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Somewhere to go. People to see.' })).toBeTruthy()
    expect(screen.getByText('There used to be a place beyond home and work where people knew your name. For a lot of us, it went missing.')).toBeTruthy()
    expect(screen.getByText('SocialUs helps people find their way back. The rest happens in person.')).toBeTruthy()
    expect(screen.getByText('We’re launching first in Sacramento.')).toBeTruthy()
    expect(screen.getByText(/something you care about: a hobby, a shared ambition/)).toBeTruthy()
    expect(screen.queryByText(/keep scrolling/)).toBeNull()
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

  it('leaves Contact out until it has a destination', () => {
    const { container } = render(<HomeLanding />)
    expect(container.querySelector('footer')!.textContent).not.toContain('Contact')
  })

  it('section 06 reads Draft 5: who can join, then the button', () => {
    const { container } = render(<HomeLanding />)
    const join = container.querySelector('#join')!
    expect(join.textContent).toContain('Sacramento is our first open market. If you’re here, join us.')
    expect(join.textContent).toContain('Not in Sacramento? You can join too. We’re not open in your area yet. If enough people there join, we could open yours next.')
    expect([...join.querySelectorAll('a')].map((a) => a.textContent)).toEqual(['Join SocialUs'])
  })

  it('all three illustrations say what they show, and the page says locals, never neighbours', () => {
    const { container } = render(<HomeLanding />)
    const imgs = [...container.querySelectorAll('img')]
    expect(imgs.length).toBe(3)
    for (const img of imgs) expect(img.getAttribute('alt')!.length).toBeGreaterThan(20)
    expect((container.textContent + imgs.map((i) => i.alt).join(' ')).toLowerCase()).not.toMatch(/neighbo/)
  })

  it('hides the app’s own nav and footer', () => {
    expect(navHidden('/')).toBe(true)
    expect(navHidden('/explore')).toBe(false)
  })
})
