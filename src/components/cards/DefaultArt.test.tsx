// #299 — default art when there is no photo: the kind's icon on a light
// neutral tone, the same for every Page of that kind (Don, 2026-10-01).
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { DefaultArt, artKindFor } from './DefaultArt'

afterEach(cleanup)

describe('#299 — DefaultArt', () => {
  it('is the same for every Page of a kind — chosen by kind, not by id', () => {
    const { rerender } = render(<DefaultArt kind="shop" />)
    const first = screen.getByTestId('default-art').outerHTML
    rerender(<DefaultArt kind="shop" />)
    expect(screen.getByTestId('default-art').outerHTML).toBe(first)
  })

  it('uses only the existing PersonMark light tones', () => {
    for (const kind of ['shop', 'service', 'group'] as const) {
      cleanup()
      render(<DefaultArt kind={kind} />)
      expect(screen.getByTestId('default-art').className).toMatch(/bg-\[var\(--color-charcoal-100\)\]|bg-neutral-200/)
    }
  })

  it('shows the kind, decoratively', () => {
    render(<DefaultArt kind="service" />)
    const art = screen.getByTestId('default-art')
    expect(art).toHaveAttribute('data-kind', 'service')
    expect(art).toHaveAttribute('aria-hidden', 'true')
    expect(art.querySelector('svg')).not.toBeNull()
    expect(art.textContent).toBe('')
  })

  it('maps Page kinds to shop, service or group', () => {
    expect(artKindFor('business')).toBe('shop')
    expect(artKindFor('practice')).toBe('service')
    for (const k of ['interest', 'place', 'event', 'family']) expect(artKindFor(k)).toBe('group')
  })
})
