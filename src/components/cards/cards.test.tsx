import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { CardGrid, TileCard, AnnouncementCard, StatusDot, MetricTile } from './index'

afterEach(cleanup)

// The card system, recovered from the pre-deletion design and made fluid.
//
// The design facts below are the ones Don named as what makes it read as
// designed rather than default. They are asserted rather than described,
// because a comment does not fail when someone changes a class.

describe('CardGrid — the fluid rule', () => {
  it('uses min() against the container, which is what survives an iPhone mini', () => {
    render(<CardGrid><li>a</li></CardGrid>)
    const style = screen.getByTestId('card-grid').getAttribute('style') ?? ''
    // The floor is 240px OR the whole container, whichever is smaller. Without
    // the min(), a 240px minimum overflows ~288px of usable width once gaps
    // and page padding are taken out.
    expect(style).toMatch(/minmax\(min\(100%, 14rem\), 1fr\)/)
    expect(style).toMatch(/auto-fill/)
  })

  it('has no media query in it at all — one rule, every width', () => {
    render(<CardGrid><li>a</li></CardGrid>)
    expect(screen.getByTestId('card-grid').getAttribute('style') ?? '').not.toMatch(/@media/)
  })

  it('offers a compact density matching the original w-44 tile', () => {
    render(<CardGrid density="compact"><li>a</li></CardGrid>)
    expect(screen.getByTestId('card-grid').getAttribute('style') ?? '').toMatch(/11rem/)
  })
})

describe('TileCard', () => {
  const loc = { scale: 'neighbourhood', label: 'Oak Park' } as const

  it('carries no fixed width — the grid cell decides', () => {
    render(<TileCard location={loc} title="Clara’s Kitchen" />)
    const cls = screen.getByTestId('tile-card').className
    expect(cls).not.toMatch(/\bw-\d/)
    expect(cls).not.toMatch(/flex-shrink-0/)
  })

  it('never has a border — the separation is white on warm off-white', () => {
    render(<TileCard location={loc} title="Clara’s Kitchen" />)
    expect(screen.getByTestId('tile-card').className).not.toMatch(/\bborder\b/)
  })

  it('lifts on hover, but only when it is actually a link', () => {
    const { rerender } = render(<TileCard location={loc} title="A" href="/p/x" />)
    expect(screen.getByTestId('tile-card').className).toMatch(/card-hover/)
    rerender(<TileCard location={loc} title="A" />)
    expect(screen.getByTestId('tile-card').className).not.toMatch(/card-hover/)
  })

  it('holds the image to a ratio rather than a fixed height', () => {
    render(<TileCard location={loc} title="A" />)
    expect(screen.getByTestId('tile-image').className).toMatch(/aspect-\[3\/2\]/)
    expect(screen.getByTestId('tile-image').className).not.toMatch(/\bh-\d/)
  })

  it('falls back to an emoji on the surface colour, not a grey box', () => {
    render(<TileCard location={loc} title="A" emoji="🥖" />)
    expect(screen.getByTestId('tile-emoji')).toHaveTextContent('🥖')
    expect(screen.getByTestId('tile-image').className).toMatch(/bg-\[var\(--color-surface\)\]/)
  })

  // ---- uniform height (Don, 2026-09-17) --------------------------------
  //
  // Reserving space, not stretching. `align-items: stretch` only equalises
  // within a row; Don wants every card the same, so each row holds its height
  // whether or not it has content.

  it('reserves two lines for the title, so a wrapping one does not grow the card', () => {
    render(<TileCard location={loc} title="A very long name that will wrap onto two lines" />)
    const t = screen.getByTestId('tile-title')
    expect(t.className).toMatch(/line-clamp-2/)
    expect(t.className).toMatch(/min-h-\[2\.5rem\]/)
  })

  it('reserves the tagline row even when there is no tagline', () => {
    render(<TileCard location={loc} title="A" />)
    const tagline = screen.getByTestId('tile-tagline')
    expect(tagline).toBeInTheDocument()
    expect(tagline.className).toMatch(/min-h-\[2\.5rem\]/)
    expect(tagline.className).toMatch(/line-clamp-2/)
  })

  it('reserves one line for the location and clamps it, so a long one cannot grow the card', () => {
    render(<TileCard location={{ scale: 'address', label: '3117 Broadway, Sacramento, California 95817' }} title="A" />)
    const l = screen.getByTestId('tile-location')
    expect(l.className).toMatch(/line-clamp-1/)
    expect(l.className).toMatch(/min-h-\[1\.25rem\]/)
  })

  it('renders the same set of rows for the emptiest and fullest card', () => {
    const { rerender } = render(<TileCard location={loc} title="A" />)
    const bare = ['tile-image', 'tile-title', 'tile-tagline', 'tile-location'].map((t) =>
      Boolean(screen.queryByTestId(t)),
    )
    rerender(
      <TileCard
        location={{ scale: 'address', label: '3117 Broadway' }}
        title="A much longer name"
        tagline="And a tagline that runs on for a while"
        imageUrl="https://x/a.webp"
      />,
    )
    const full = ['tile-image', 'tile-title', 'tile-tagline', 'tile-location'].map((t) =>
      Boolean(screen.queryByTestId(t)),
    )
    expect(bare).toEqual(full)
    expect(bare.every(Boolean)).toBe(true)
  })

  // ---- location is required --------------------------------------------

  it('always shows a location line, including for something with no physical place', () => {
    render(<TileCard location={{ scale: 'online' }} title="Ledger & Ink" />)
    expect(screen.getByTestId('tile-location')).toHaveTextContent('Online')
  })

  it('records the scale on the card, so a surface can style or filter by it', () => {
    render(<TileCard location={{ scale: 'online' }} title="A" />)
    expect(screen.getByTestId('tile-card')).toHaveAttribute('data-location-scale', 'online')
  })

  // ---- padding and underline -------------------------------------------

  it('pads the text away from the card edge, while the image still bleeds', () => {
    render(<TileCard location={loc} title="A" />)
    expect(screen.getByTestId('tile-text').className).toMatch(/px-3/)
    expect(screen.getByTestId('tile-image').className).not.toMatch(/px-/)
  })

  it('does not ask the link to underline — the affordance is lift plus colour', () => {
    render(<TileCard location={loc} title="A" href="/p/x" />)
    const link = screen.getByRole('link')
    expect(link.className).not.toMatch(/underline/)
    // The replacement: the title takes the accent colour on card hover.
    expect(screen.getByTestId('tile-title').className).toMatch(/group-hover\/tile:text-\[var\(--color-accent\)\]/)
  })
})

describe('AnnouncementCard', () => {
  it('puts the attribution in the accent colour — it does the job a photo does', () => {
    render(<AnnouncementCard attribution="Clara’s Kitchen" body="..." />)
    expect(screen.getByText('Clara’s Kitchen').className).toMatch(/text-\[var\(--color-accent\)\]/)
  })

  it('clamps the body to three lines and preserves its line breaks', () => {
    render(<AnnouncementCard attribution="A" body="line one\nline two" />)
    const p = screen.getByText(/line one/)
    expect(p.className).toMatch(/line-clamp-3/)
    expect(p.className).toMatch(/whitespace-pre-wrap/)
  })
})

describe('StatusDot', () => {
  it('is a dot plus a sentence, never a pill with the text inside', () => {
    render(<StatusDot color="#1b7a3d" label="Locally owned and operated" />)
    expect(screen.getByTestId('status-dot-swatch').className).toMatch(/w-3 h-3 rounded-full/)
    expect(screen.getByTestId('status-dot-label')).toHaveTextContent('Locally owned and operated')
  })

  // Colour is never the only signal.
  it('always carries the words, so the colour is not load-bearing', () => {
    render(<StatusDot color="#b0b0b0" label="Competing against consolidation" />)
    expect(screen.getByTestId('status-dot-label').textContent?.length).toBeGreaterThan(0)
    expect(screen.getByTestId('status-dot-swatch')).toHaveAttribute('aria-hidden')
  })
})

describe('MetricTile', () => {
  it('renders the four parts in order', () => {
    render(<MetricTile label="Profile views" value={128} deltaLabel="+31 vs prior 7d" points={[1, 3, 2, 5]} />)
    expect(screen.getByText('Profile views').className).toMatch(/uppercase/)
    expect(screen.getByText('128')).toBeInTheDocument()
    expect(screen.getByText('+31 vs prior 7d')).toBeInTheDocument()
  })

  // The habit worth carrying: a written state, never a bare 0%.
  it('takes a sentence for the delta, so "No activity yet" is expressible', () => {
    render(<MetricTile label="Support taps" value={0} deltaLabel="No activity yet" positive={false} />)
    expect(screen.getByText('No activity yet')).toBeInTheDocument()
  })

  it('drops the sparkline rather than drawing a flat line from one point', () => {
    const { container } = render(<MetricTile label="A" value={1} deltaLabel="x" points={[1]} />)
    expect(container.querySelector('svg')).toBeNull()
  })

  it('goes grey rather than accent when the delta is not positive', () => {
    render(<MetricTile label="A" value={1} deltaLabel="down" positive={false} />)
    expect(screen.getByText('down').className).toMatch(/text-neutral-500/)
  })
})
