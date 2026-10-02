// #299 — default art when there is no photo: a neutral tone chosen by the
// Page's id, and the kind's icon. No new colours, no emoji.
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { DefaultArt, artKindFor } from './DefaultArt'

afterEach(cleanup)

describe('#299 — DefaultArt', () => {
  it('picks the same tone for the same Page, every time', () => {
    const { rerender } = render(<DefaultArt seed="g-123" kind="shop" />)
    const first = screen.getByTestId('default-art').className
    rerender(<DefaultArt seed="g-123" kind="shop" />)
    expect(screen.getByTestId('default-art').className).toBe(first)
  })

  it('uses only the existing PersonMark tones', () => {
    render(<DefaultArt seed="g-xyz" kind="group" />)
    expect(screen.getByTestId('default-art').className).toMatch(/bg-\[var\(--color-charcoal-(100|700)\)\]|bg-neutral-(200|700)/)
  })

  it('shows the kind, decoratively', () => {
    render(<DefaultArt seed="g-1" kind="service" />)
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
