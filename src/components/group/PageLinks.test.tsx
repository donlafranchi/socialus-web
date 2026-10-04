// #344 — a Page's links out: one row of icon buttons, and the website as one link.

import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { PageLinks } from './PageLinks'

afterEach(cleanup)
const links = {
  instagram: 'https://instagram.com/claras',
  tiktok: 'https://tiktok.com/@claras',
  website: 'https://clarasbakery.example',
}

describe('#344 — links out', () => {
  it('are one row of icon buttons, each named for its platform', () => {
    render(<PageLinks links={links} />)
    const row = screen.getByTestId('page-social-icons')
    expect(row.tagName).not.toBe('UL')
    const insta = screen.getByRole('link', { name: 'Instagram' })
    expect(insta).toHaveAttribute('href', links.instagram)
    expect(insta).toHaveAttribute('rel', 'noopener noreferrer')
    expect(insta.querySelector('svg')).not.toBeNull()
    expect(insta).toHaveTextContent('')
    expect(screen.getByRole('link', { name: 'TikTok' })).toBeInTheDocument()
  })

  it('every icon is a full tap target', () => {
    render(<PageLinks links={links} />)
    expect(screen.getByRole('link', { name: 'Instagram' }).className).toMatch(/size-tap/)
  })

  it('keep the website as one plain link, not an icon', () => {
    render(<PageLinks links={links} />)
    const site = screen.getByTestId('page-website')
    expect(site).toHaveAttribute('href', links.website)
    expect(site).toHaveTextContent('clarasbakery.example')
    expect(screen.getByTestId('page-social-icons')).not.toContainElement(site)
  })

  it('refuse an unsafe link, and render nothing when there are none', () => {
    const { container } = render(<PageLinks links={{ instagram: 'javascript:alert(1)' }} />)
    expect(container).toBeEmptyDOMElement()
  })
})
