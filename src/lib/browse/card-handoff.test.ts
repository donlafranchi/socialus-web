// #555 — the card hands what it already knows to the Page it opens, so the Page's shell can show its name,
// kind and photo the instant the tap lands (optimistic render), while the rest streams in.

import { describe, it, expect } from 'vitest'
import { stashCardForPage, readCardForPage, type CardHandoff } from './card-handoff'

function memory() {
  const m = new Map<string, string>()
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m }
}
const CARD: CardHandoff = { name: 'Bean Co', kindLine: 'Business', imageUrl: 'https://x.test/a.webp' }
const NOW = 1_000_000

describe('card handoff', () => {
  // A tap on a card is answered at once, from what the card already carries (#555).
  it('gives a Page what the card carried, by the Page\'s path', () => {
    const storage = memory()
    stashCardForPage('/g/abc123', CARD, { storage, now: () => NOW })
    expect(readCardForPage('/g/abc123', { storage, now: () => NOW + 1000 })).toEqual(CARD)
  })

  it('a post card\'s link, with its #announcement fragment, is the same Page', () => {
    const storage = memory()
    stashCardForPage('/g/abc123#announcement-p-1', CARD, { storage, now: () => NOW })
    expect(readCardForPage('/g/abc123', { storage, now: () => NOW })).toEqual(CARD)
  })

  it('only Pages: any other link is not stashed', () => {
    const storage = memory()
    stashCardForPage('/m/maya', CARD, { storage, now: () => NOW })
    stashCardForPage('https://elsewhere.test/g/abc123', CARD, { storage, now: () => NOW })
    expect(storage.m.size).toBe(0)
  })

  it('a stale handoff is not used: it lasts seconds, not the session', () => {
    const storage = memory()
    stashCardForPage('/g/abc123', CARD, { storage, now: () => NOW })
    expect(readCardForPage('/g/abc123', { storage, now: () => NOW + 31_000 })).toBeNull()
  })

  it('another Page gets nothing', () => {
    const storage = memory()
    stashCardForPage('/g/abc123', CARD, { storage, now: () => NOW })
    expect(readCardForPage('/g/zzz999', { storage, now: () => NOW })).toBeNull()
  })

  it('storage that is missing, full or blocked is no handoff, never an error', () => {
    const broken = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('full') }, removeItem: () => {} }
    expect(() => stashCardForPage('/g/abc123', CARD, { storage: broken })).not.toThrow()
    expect(readCardForPage('/g/abc123', { storage: broken })).toBeNull()
    expect(readCardForPage('/g/abc123', { storage: null })).toBeNull()
  })

  it('carries only the light payload: the name, the kind line and the photo address', () => {
    const storage = memory()
    stashCardForPage('/g/abc123', { ...CARD, extra: 'a whole description' } as never, { storage, now: () => NOW })
    expect(JSON.stringify([...storage.m.values()])).not.toContain('a whole description')
  })

  it('a malformed stored value is no handoff', () => {
    const storage = memory()
    storage.setItem('card-handoff:/g/abc123', '{not json')
    expect(readCardForPage('/g/abc123', { storage })).toBeNull()
  })
})
