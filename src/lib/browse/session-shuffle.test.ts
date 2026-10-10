import { describe, it, expect } from 'vitest'
import { sessionShuffle, resolveSeedCookie, seedFromCookie, newSeed } from './session-shuffle'

const NOW = new Date('2026-10-10T12:00:00Z')
const DAY = 86_400_000
type Row = { id: string; at: string }
const ago = (d: number) => new Date(NOW.getTime() - d * DAY).toISOString()
const rows: Row[] = [
  ...Array.from({ length: 30 }, (_, i) => ({ id: `fresh-${i}`, at: ago(0.1 + (i % 10) * 0.1) })),
  ...Array.from({ length: 30 }, (_, i) => ({ id: `week-${i}`, at: ago(3 + (i % 4)) })),
  ...Array.from({ length: 30 }, (_, i) => ({ id: `old-${i}`, at: ago(60 + i) })),
]
const opts = { id: (r: Row) => r.id, at: (r: Row) => r.at, now: NOW }
const ids = (xs: Row[]) => xs.map((r) => r.id)

describe('sessionShuffle', () => {
  it('same seed gives the same order, whatever order the rows arrive in', () => {
    const a = sessionShuffle(rows, 'seed-one', opts)
    expect(ids(sessionShuffle(rows, 'seed-one', opts))).toEqual(ids(a))
    expect(ids(sessionShuffle([...rows].reverse(), 'seed-one', opts))).toEqual(ids(a))
  })

  it('a different seed gives a different order', () => {
    expect(ids(sessionShuffle(rows, 'seed-one', opts))).not.toEqual(ids(sessionShuffle(rows, 'seed-two', opts)))
  })

  it('drops and duplicates nothing', () => {
    const out = sessionShuffle(rows, 'seed-one', opts)
    expect(out).toHaveLength(rows.length)
    expect(new Set(ids(out))).toEqual(new Set(ids(rows)))
  })

  it('keeps band order: fresh before this week before older, under every seed', () => {
    for (const seed of ['a', 'b', 'c', 'd']) {
      const prefixes = ids(sessionShuffle(rows, seed, opts)).map((id) => id.split('-')[0])
      expect(prefixes.slice(0, 30).every((p) => p === 'fresh')).toBe(true)
      expect(prefixes.slice(30, 60).every((p) => p === 'week')).toBe(true)
      expect(prefixes.slice(60).every((p) => p === 'old')).toBe(true)
    }
  })

  it('leaves the order alone without a seed, and for lists of one', () => {
    expect(sessionShuffle(rows, null, opts)).toBe(rows)
    expect(sessionShuffle([rows[0]], 'x', opts)).toEqual([rows[0]])
  })

  it('treats an unparseable timestamp as oldest', () => {
    const out = sessionShuffle([{ id: 'bad', at: 'nope' }, rows[0]], 'x', opts)
    expect(ids(out)).toEqual([rows[0].id, 'bad'])
  })
})

describe('session seed cookie', () => {
  it('mints when absent, malformed, or the signed-in state changed; keeps otherwise', () => {
    const anon = resolveSeedCookie(undefined, false)
    expect(anon.minted).toBe(true)
    expect(resolveSeedCookie(anon.value, false)).toEqual({ value: anon.value, minted: false })
    const member = resolveSeedCookie(anon.value, true)
    expect(member.minted).toBe(true)
    expect(member.value).not.toBe(anon.value)
    expect(resolveSeedCookie('garbage', true).minted).toBe(true)
  })

  it('reads the seed back and carries no identity', () => {
    const { value } = resolveSeedCookie(undefined, true)
    expect(seedFromCookie(value)).toBe(value.slice(2))
    expect(seedFromCookie('zzz')).toBeNull()
    expect(seedFromCookie(undefined)).toBeNull()
    expect(newSeed()).toMatch(/^[0-9a-z]{16}$/)
  })
})
