import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { readFileSync } from 'node:fs'
import { ShelfRow, ShelfScreen } from './ShelfRow'

afterEach(cleanup)

const items = Array.from({ length: 30 }, (_, i) => `item ${i}`)
const row = (over: Partial<Parameters<typeof ShelfRow<string>>[0]> = {}) => (
  <ShelfRow title="Concerts" items={items} keyOf={(s) => s} renderItem={(s) => <span>{s}</span>} onSeeAll={() => {}} {...over} />
)

describe('ShelfRow', () => {
  it('is one row that scrolls sideways, never wrapping to a new line', () => {
    render(row())
    const list = screen.getByRole('list')
    expect(list.className).toMatch(/\bflex\b/)
    expect(list.className).toMatch(/flex-nowrap/)
    expect(list.className).toMatch(/overflow-x-auto/)
    expect(list.className).not.toMatch(/flex-wrap\b|grid/)
  })

  // F059 eval, 2026-11-01: a card's sr-only label escaped an unpositioned row item and widened a phone's page to 1224px.
  it('anchors each item, so nothing in a card can escape the row and widen the page', () => {
    render(row())
    for (const li of screen.getAllByRole('listitem')) expect(li.className).toMatch(/\brelative\b/)
  })

  it('shows a capped number of items; the rest are behind See all', () => {
    render(row({ limit: 12 }))
    expect(screen.getAllByRole('listitem')).toHaveLength(12)
  })

  it('opens the full list from the title and from See all', () => {
    const onSeeAll = vi.fn()
    render(row({ onSeeAll }))
    fireEvent.click(screen.getByRole('button', { name: /^Concerts/ }))
    fireEvent.click(screen.getByRole('button', { name: /See all/ }))
    expect(onSeeAll).toHaveBeenCalledTimes(2)
  })

  it('has left and right arrows that move the row by about a screen', () => {
    render(row())
    const list = screen.getByRole('list')
    const scrollBy = vi.fn()
    Object.assign(list, { scrollBy })
    Object.defineProperty(list, 'clientWidth', { value: 1000 })
    fireEvent.click(screen.getByRole('button', { name: 'Scroll Concerts right' }))
    fireEvent.click(screen.getByRole('button', { name: 'Scroll Concerts left' }))
    expect(scrollBy.mock.calls.map(([o]) => Math.sign(o.left))).toEqual([1, -1])
    expect(Math.abs(scrollBy.mock.calls[0]![0].left)).toBeGreaterThan(500)
  })

  it('hides the arrows on a phone, where a swipe does it', () => {
    render(row())
    for (const b of screen.getAllByRole('button', { name: /^Scroll Concerts/ })) expect(b.className).toMatch(/\bhidden\b.*md:inline-flex|md:inline-flex.*\bhidden\b/)
  })

  it('keeps the title a heading that screen readers can jump to, with the button inside it', () => {
    render(row())
    const heading = screen.getByRole('heading', { name: /^Concerts/ })
    expect(heading.querySelector('button')).not.toBeNull()
  })

  // Don, 2026-11-02: posts "a little bit larger … take up more screen space". About one and a half post cards on a
  // phone (the next one peeks, as Airbnb's and Eventbrite's rows do); fewer, wider cards than Pages on a wide screen.
  it('sizes a row of posts to about one and a half cards on a phone, and wider than Pages on a wide screen', () => {
    render(row({ size: 'post' }))
    const li = screen.getAllByRole('listitem')[0]!
    // The row's gap is spacing 3: one gap before the half card on a phone, two from 768px.
    expect(li.className).toMatch(/(^|\s)w-\[calc\(\(100%-var\(--spacing\)\*3\)\/1\.5\)\]/)
    expect(li.className).toMatch(/md:w-\[calc\(\(100%-var\(--spacing\)\*6\)\/2\.25\)\]/)
    const css = readFileSync('src/app/globals.css', 'utf8')
    expect(li.className).toMatch(/\bmax-w-post-card\b/)
    expect(Number(/--container-post-card:\s*([\d.]+)rem/.exec(css)![1]) * 16).toBeGreaterThan(288)
  })

  it('leaves a row of Pages at its size', () => {
    render(row())
    const li = screen.getAllByRole('listitem')[0]!
    expect(li.className).toMatch(/w-4\/5 max-w-72/)
  })

  it('renders nothing when there is nothing to show', () => {
    const { container } = render(row({ items: [] }))
    expect(container).toBeEmptyDOMElement()
  })
})

describe('ShelfScreen', () => {
  const screenOf = (onClose = vi.fn()) => (
    <ShelfScreen title="Concerts" items={['a', 'b']} keyOf={(s) => s} renderItem={(s) => <a href={`/${s}`}>{s}</a>} onClose={onClose} />
  )

  it('keeps Tab inside the list, and gives focus back to what opened it', () => {
    const opener = document.createElement('button')
    document.body.appendChild(opener)
    opener.focus()
    const { unmount } = render(screenOf())
    const back = screen.getByRole('button', { name: 'Back' })
    const last = screen.getByRole('link', { name: 'b' })
    last.focus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(document.activeElement).toBe(back)
    back.focus()
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(last)
    unmount()
    expect(document.activeElement).toBe(opener)
    opener.remove()
  })

  it('two open lists never share a title id', () => {
    render(<>{screenOf()}{screenOf()}</>)
    const ids = screen.getAllByRole('dialog').map((d) => d.getAttribute('aria-labelledby'))
    expect(new Set(ids).size).toBe(2)
  })

  it('lays a full list of posts out in fewer, wider columns than Pages', () => {
    const { unmount } = render(<ShelfScreen title="Concerts" size="post" items={['a']} keyOf={(s) => s} renderItem={(s) => <span>{s}</span>} onClose={() => {}} />)
    expect(screen.getByTestId('card-grid')).toHaveAttribute('data-density', 'roomy')
    unmount()
    render(<ShelfScreen title="Cafés" items={['a']} keyOf={(s) => s} renderItem={(s) => <span>{s}</span>} onClose={() => {}} />)
    expect(screen.getByTestId('card-grid')).toHaveAttribute('data-density', 'comfortable')
  })

  it('lists every item and closes with Back or Escape', () => {
    const onClose = vi.fn()
    render(<ShelfScreen title="Concerts" items={items} keyOf={(s) => s} renderItem={(s) => <span>{s}</span>} onClose={onClose} />)
    expect(screen.getByRole('heading', { name: 'Concerts' })).toBeInTheDocument()
    expect(screen.getAllByText(/^item /)).toHaveLength(30)
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(2)
  })
})
