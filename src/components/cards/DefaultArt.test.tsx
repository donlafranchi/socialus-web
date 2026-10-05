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

  // Path: well-worn — the design language's default-art rule, in the Anodised
  // palette: the kind's icon in gold on a navy frame (Don, 2026-10-04).
  it('is a navy tile with the kind in gold, the same for every kind', () => {
    for (const kind of ['shop', 'service', 'group'] as const) {
      cleanup()
      render(<DefaultArt kind={kind} />)
      const art = screen.getByTestId('default-art')
      expect(art.className).toContain('bg-[var(--color-frame)]')
      expect(art.className).toContain('text-[var(--color-highlight-soft)]')
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
    expect(artKindFor('business', 'service')).toBe('service')
    for (const k of ['group', 'interest']) expect(artKindFor(k)).toBe('group')
  })

  it('draws no icon when the kind is unknown, rather than guessing one', () => {
    for (const k of ['', null, undefined]) expect(artKindFor(k)).toBeNull()
    render(<DefaultArt kind={null} />)
    expect(screen.getByTestId('default-art').querySelector('svg')).toBeNull()
  })
})
