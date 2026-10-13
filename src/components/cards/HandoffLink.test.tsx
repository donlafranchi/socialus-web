// #555 — a card's link hands the Page what the card knows, on the tap, and does nothing else different.

import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

const { stash } = vi.hoisted(() => ({ stash: vi.fn() }))
const { linkProps } = vi.hoisted(() => ({ linkProps: vi.fn() }))
vi.mock('@/lib/browse/card-handoff', () => ({ stashCardForPage: stash }))
vi.mock('next/link', () => ({
  default: ({ href, prefetch, children, ...rest }: { href: string; prefetch?: boolean; children: React.ReactNode } & Record<string, unknown>) => {
    linkProps(prefetch)
    return <a href={href} {...(rest as object)}>{children}</a>
  },
}))

import { HandoffLink } from './HandoffLink'

afterEach(() => {
  cleanup()
  stash.mockClear()
})

describe('HandoffLink', () => {
  it('stashes the card for its Page when it is tapped, and still links there', () => {
    render(
      <HandoffLink href="/g/abc123" handoff={{ name: 'Bean Co', kindLine: 'Business', imageUrl: null }} className="block">
        Bean Co
      </HandoffLink>,
    )
    const link = screen.getByRole('link', { name: 'Bean Co' })
    expect(link).toHaveAttribute('href', '/g/abc123')
    expect(stash).not.toHaveBeenCalled()
    fireEvent.click(link)
    expect(stash).toHaveBeenCalledWith('/g/abc123', { name: 'Bean Co', kindLine: 'Business', imageUrl: null })
  })

  it('also on a press-down, which is the earliest the Page can know', () => {
    render(<HandoffLink href="/g/abc123" handoff={{ name: 'Bean Co' }}>x</HandoffLink>)
    fireEvent.pointerDown(screen.getByRole('link'))
    expect(stash).toHaveBeenCalledTimes(1)
  })

  it('without a handoff it is a plain link', () => {
    render(<HandoffLink href="/g/abc123">x</HandoffLink>)
    fireEvent.click(screen.getByRole('link'))
    expect(stash).not.toHaveBeenCalled()
  })
})

// #555 — prefetch on the intent to tap: the router reads the loading shell as the card scrolls into view, and the
// whole Page once a pointer hovers it, a finger rests on it, or it takes focus.
describe('HandoffLink — prefetch on intent', () => {
  const lastPrefetch = () => linkProps.mock.calls.at(-1)![0]

  it('leaves the router\'s default (the loading shell on view) until there is intent', () => {
    linkProps.mockClear()
    render(<HandoffLink href="/g/abc123">x</HandoffLink>)
    expect(lastPrefetch()).toBeUndefined()
  })

  it.each([
    ['hover', (el: HTMLElement) => fireEvent.mouseEnter(el)],
    ['focus', (el: HTMLElement) => fireEvent.focus(el)],
    ['touch', (el: HTMLElement) => fireEvent.touchStart(el)],
  ])('reads the whole Page on %s', (_name, act) => {
    linkProps.mockClear()
    render(<HandoffLink href="/g/abc123">x</HandoffLink>)
    act(screen.getByRole('link'))
    expect(lastPrefetch()).toBe(true)
  })

  it('a card that asked for the whole Page ahead of time keeps it', () => {
    linkProps.mockClear()
    render(<HandoffLink href="/g/abc123" prefetch>x</HandoffLink>)
    expect(lastPrefetch()).toBe(true)
  })
})
