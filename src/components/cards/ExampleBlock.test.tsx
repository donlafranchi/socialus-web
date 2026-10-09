// Don's ruling, 2026-09-17: sample cards carry a mark — and the mark is the
// LAST line of defence, not the first. A stranger scrolling reads shapes, not
// badges. These tests guard the two things that actually carry the weight:
// separation and non-interactivity.

import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { ExampleBlock } from './ExampleBlock'

afterEach(cleanup)

const PLACE = 'Boise City, ID'

describe('an example card cannot be mistaken for a real listing', () => {
  it('every card carries a persistent mark', () => {
    render(<ExampleBlock placeName={PLACE} />)
    const cards = screen.getAllByTestId('example-card')
    expect(cards.length).toBeGreaterThan(0)
    for (const c of cards) {
      expect(within(c).getByTestId('example-mark')).toHaveTextContent(/example/i)
    }
  })

  // The rule that matters most: no affordance implying a real Page.
  it('has no link, no follow or support control, nothing clickable at all', () => {
    render(<ExampleBlock placeName={PLACE} />)
    for (const c of screen.getAllByTestId('example-card')) {
      expect(c.querySelector('a')).toBeNull()
      expect(c.querySelector('button')).toBeNull()
      expect(c.querySelector('[role="button"]')).toBeNull()
    }
  })

  // Caught in the browser, not by a test: the tint was written as a utility
  // class and `.card`'s own `bg-white` won the cascade, so example cards were
  // rendering on the same white as real ones. The one difference a glance
  // would not catch.
  it('sits on the tinted ground, not on card white', () => {
    render(<ExampleBlock placeName={PLACE} />)
    for (const c of screen.getAllByTestId('example-card')) {
      expect((c as HTMLElement).style.backgroundColor).toBe('var(--color-surface)')
    }
  })

  it('does not lift like a real card — nothing here responds to a pointer', () => {
    render(<ExampleBlock placeName={PLACE} />)
    for (const c of screen.getAllByTestId('example-card')) {
      expect(c.className).not.toContain('card-hover')
      expect(c.className).not.toContain('lift')
    }
  })
})

describe('the block is bounded and captioned as an idea, not as stock', () => {
  it('is its own labelled region with its own heading', () => {
    render(<ExampleBlock placeName={PLACE} />)
    const block = screen.getByTestId('example-block')
    expect(block.tagName).toBe('SECTION')
    expect(within(block).getByRole('heading')).toBeInTheDocument()
  })

  it('has its own grid — the examples never share one with results', () => {
    render(<ExampleBlock placeName={PLACE} />)
    const block = screen.getByTestId('example-block')
    const grid = within(block).getByTestId('card-grid')
    // Every card in this grid is an example. A real card here would be the bug.
    const cards = within(grid).getAllByRole('listitem')
    for (const c of cards) expect(c).toHaveAttribute('data-testid', 'example-card')
  })

  it('says the cards are made up rather than implying they are a sample of stock', () => {
    render(<ExampleBlock placeName={PLACE} />)
    const block = screen.getByTestId('example-block')
    expect(block).toHaveTextContent(/made up/i)
    expect(block).toHaveTextContent(new RegExp(`Nothing here is a real Page in ${PLACE}`, 'i'))
    // "Some of what's here" would be the claim the caption must not make.
    expect(block).not.toHaveTextContent(/some of what/i)
  })
})

describe('the names', () => {
  it('uses the real metro under discussion, not an invented city', () => {
    render(<ExampleBlock placeName={PLACE} />)
    for (const c of screen.getAllByTestId('example-card')) {
      expect(c).toHaveTextContent(PLACE)
    }
  })

  // A plausible name is indistinguishable from a real listing at a glance, and
  // could collide with an actual business.
  it('gives every business an obviously illustrative name', () => {
    render(<ExampleBlock placeName={PLACE} />)
    const titles = screen.getAllByTestId('example-card').map((c) => c.textContent ?? '')
    for (const t of titles) {
      expect(t).toMatch(/example|sample|illustrative/i)
    }
  })
})
