// #299 — Explore's loading state (L01): the shape of the page, not a word.
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { ExploreSkeleton } from './ExploreSkeleton'

afterEach(cleanup)

describe('#299 — ExploreSkeleton', () => {
  it('says it is loading, once, and draws placeholder cards', () => {
    render(<ExploreSkeleton />)
    expect(screen.getByRole('status')).toHaveTextContent(/loading/i)
    expect(screen.getAllByTestId('skeleton-card').length).toBeGreaterThanOrEqual(4)
  })
  it('stills its shimmer for people who ask for less motion', () => {
    render(<ExploreSkeleton />)
    expect(screen.getAllByTestId('skeleton-card')[0]!.className).toContain('motion-safe:animate-pulse')
  })
})
