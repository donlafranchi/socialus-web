// F086 (thin front) — the placeholder that stands in for a photo.
//
// `members.avatar_url` has no write path and nobody has one, so this is what
// every person shows today. design-language.md rules the shape: deterministic,
// the same mark for the same person on every load and to every viewer, never a
// colour picked at random, never an emoji, never stock photography.

import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { PersonMark, initialFor } from './PersonMark'

afterEach(cleanup)

describe('the initial', () => {
  it('is the first letter of the name, uppercased', () => {
    expect(initialFor('maya rivera')).toBe('M')
  })

  it('skips whitespace rather than rendering a blank square', () => {
    expect(initialFor('   theo')).toBe('T')
  })

  it('falls back to a neutral mark for an empty name', () => {
    expect(initialFor('')).toBe('·')
    expect(initialFor('   ')).toBe('·')
  })

  it('handles a name that starts with a digit or symbol', () => {
    expect(initialFor('3 Sisters Farm')).toBe('3')
  })
})

describe('the mark', () => {
  it('shows the initial when there is no photo', () => {
    render(<PersonMark name="Maya Rivera" />)
    expect(screen.getByTestId('person-mark')).toHaveTextContent('M')
  })

  it('is deterministic — the same person renders the same mark twice', () => {
    const { container: a } = render(<PersonMark name="Maya Rivera" />)
    const first = a.querySelector('[data-testid="person-mark"]')?.getAttribute('data-tone')
    cleanup()
    const { container: b } = render(<PersonMark name="Maya Rivera" />)
    expect(b.querySelector('[data-testid="person-mark"]')?.getAttribute('data-tone')).toBe(first)
  })

  it('gives different people different tones, within a fixed set', () => {
    const tones = new Set<string>()
    for (const n of ['Maya', 'Theo', 'Priya', 'Sam', 'Dana', 'Rosa']) {
      const { container } = render(<PersonMark name={n} />)
      tones.add(container.querySelector('[data-testid="person-mark"]')!.getAttribute('data-tone')!)
      cleanup()
    }
    expect(tones.size).toBeGreaterThan(1)
  })

  it('renders the photo instead when there is one', () => {
    render(<PersonMark name="Maya Rivera" photoUrl="https://x/a.webp" />)
    const img = screen.getByTestId('person-mark-photo')
    expect(img).toHaveAttribute('src', 'https://x/a.webp')
    expect(screen.queryByTestId('person-mark')).not.toBeInTheDocument()
  })

  it('is decorative — the adjacent name labels it, so it is not announced twice', () => {
    render(<PersonMark name="Maya Rivera" photoUrl="https://x/a.webp" />)
    expect(screen.getByTestId('person-mark-photo')).toHaveAttribute('alt', '')
  })

  it('never renders a broken image when the url is empty string', () => {
    render(<PersonMark name="Maya Rivera" photoUrl="" />)
    expect(screen.getByTestId('person-mark')).toBeInTheDocument()
    expect(screen.queryByTestId('person-mark-photo')).not.toBeInTheDocument()
  })
})
