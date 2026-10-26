// #316 — tags as familiar hashtags: #tag chips you can tap to search.
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { TagLinks, hashtag } from './TagLinks'

afterEach(cleanup)

describe('#316 — TagLinks', () => {
  it('shows each tag as #tag, linking to Explore filtered by it', () => {
    render(<TagLinks tags={['Sourdough', 'Local food']} />)
    const a = screen.getByRole('link', { name: '#Sourdough' })
    expect(a).toHaveAttribute('href', '/explore?category=sourdough')
    expect(screen.getByRole('link', { name: '#Localfood' })).toHaveAttribute('href', '/explore?category=local%20food')
  })

  it('each chip is a 44px tap target', () => {
    render(<TagLinks tags={['Sourdough']} />)
    expect(screen.getByRole('link', { name: '#Sourdough' })).toHaveClass('min-h-11')
  })

  it('renders nothing for no tags', () => {
    const { container } = render(<TagLinks tags={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('writes a tag the way people write hashtags', () => {
    expect(hashtag('Local food')).toBe('#Localfood')
    expect(hashtag('#bread')).toBe('#bread')
  })
})
