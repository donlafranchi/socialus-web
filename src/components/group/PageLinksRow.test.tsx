import { describe, it, expect, afterEach } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { PageLinksRow } from './PageLinksRow'
import { contactLinksForDisplay } from '@/lib/groups/social-links'

afterEach(cleanup)

const links = contactLinksForDisplay(
  {
    facebook: 'https://www.facebook.com/plantfoundry',
    instagram: 'https://www.instagram.com/plantfoundry',
    tiktok: 'https://www.tiktok.com/@plantfoundry',
    youtube: 'https://www.youtube.com/@plantfoundry',
  },
  'https://plantfoundry.com/',
)

describe('the links under a Page name', () => {
  it('shows the website then each social as a labelled icon link that opens off-platform', () => {
    render(<PageLinksRow links={links} />)
    const row = screen.getByTestId('page-links')
    const all = [...row.querySelectorAll('a')]
    expect(all.map((a) => a.getAttribute('aria-label'))).toEqual(['Website: plantfoundry.com', 'TikTok', 'Instagram', 'Facebook', 'YouTube'])
    expect(screen.getByTestId('page-link-instagram')).toHaveAttribute('href', 'https://www.instagram.com/plantfoundry')
    for (const a of all) {
      expect(a).toHaveAttribute('target', '_blank')
      expect(a).toHaveAttribute('rel', 'noopener noreferrer')
    }
  })

  it('renders nothing for a Page with no links', () => {
    render(<PageLinksRow links={{ website: null, socials: [] }} />)
    expect(screen.queryByTestId('page-links')).toBeNull()
  })
})
