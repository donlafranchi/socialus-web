// `/` — Don's reviewed copy, word for word, with his open brackets kept visible until answered.

import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import HomeLanding from './page'
import { HOME, HOME_TODO } from '@/lib/home-landing'
import { navHidden } from '@/components/BottomNav'

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
    for (const l of HOME.footer.links.filter((l) => l.href)) expect(screen.getByRole('link', { name: l.label }).getAttribute('href')).toBe(l.href)
  })

  it('shows Contact unlinked until it has a destination', () => {
    const { container } = render(<HomeLanding />)
    expect(container.querySelector('footer')!.textContent).toContain('Contact')
    expect(screen.queryByRole('link', { name: 'Contact' })).toBeNull()
  })

  it('section 06 reads Draft 5: who can join, then the button', () => {
    const { container } = render(<HomeLanding />)
    const join = container.querySelector('#join')!
    expect(join.textContent).toContain('Sacramento is our first open market. If you’re here, join us.')
    expect(join.textContent).toContain('Not in Sacramento? You can join too. We’re not open in your area yet. If enough people there join, we could open yours next.')
    expect([...join.querySelectorAll('a')].map((a) => a.textContent)).toEqual(['Join SocialUs'])
  })

  it('the hero art is decoration, not a slogan', () => {
    const { container } = render(<HomeLanding />)
    expect(container.querySelector('section img')?.getAttribute('alt')).toBe('')
  })

  it('hides the app’s own nav and footer', () => {
    expect(navHidden('/')).toBe(true)
    expect(navHidden('/explore')).toBe(false)
  })
})
