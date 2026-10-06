import { describe, it, expect } from 'vitest'
import { buildMix, parseMixConfig, bucketCounts, DEFAULT_MIX, type Bucket } from './mix'
import type { BrowseResult } from '@/lib/feed/browse-feed'

const r = (id: string, over: Partial<BrowseResult> = {}) =>
  ({ resultKind: 'page', resultId: id, groupId: id, longitude: -121.5, latitude: 38.6, ...over }) as BrowseResult
const many = (p: string, n: number) => Array.from({ length: n }, (_, i) => r(`${p}${i}`))
const empty: Record<Bucket, BrowseResult[]> = { dated: [], new: [], recent: [], interesting: [] }

describe('#331 — the default map is a tunable mix (Don, 2026-10-05)', () => {
  it('splits the cap evenly by default', () => {
    const mix = buildMix({ dated: many('d', 50), new: many('n', 50), recent: many('r', 50), interesting: many('i', 50) }, { ...DEFAULT_MIX, cap: 40 })
    expect(mix).toHaveLength(40)
    expect(bucketCounts(mix)).toEqual({ dated: 10, new: 10, recent: 10, interesting: 10 })
  })

  it('follows the weights, and zero turns a bucket off', () => {
    const cfg = { ...DEFAULT_MIX, cap: 30, weights: { dated: 2, new: 1, recent: 0, interesting: 0 } }
    const mix = buildMix({ dated: many('d', 50), new: many('n', 50), recent: many('r', 50), interesting: [] }, cfg)
    expect(bucketCounts(mix)).toEqual({ dated: 20, new: 10, recent: 0, interesting: 0 })
  })

  it('a short bucket hands its room to the others', () => {
    const mix = buildMix({ ...empty, dated: many('d', 2), recent: many('r', 50) }, { ...DEFAULT_MIX, cap: 20 })
    expect(mix).toHaveLength(20)
    expect(bucketCounts(mix).dated).toBe(2)
  })

  it('shows a thing once, under the first bucket that claimed it, and only things with a place', () => {
    const shared = r('x')
    const mix = buildMix({ ...empty, dated: [shared, r('nowhere', { longitude: null, latitude: null })], recent: [shared] }, DEFAULT_MIX)
    expect(mix.map((m) => [m.resultId, m.bucket])).toEqual([['x', 'dated']])
  })

  it('a hand-edited setting that is wrong falls back to the defaults', () => {
    expect(parseMixConfig(null)).toEqual(DEFAULT_MIX)
    expect(parseMixConfig({ cap: -5, weights: { dated: 'lots' }, interesting: ['p1', 7] })).toEqual({ ...DEFAULT_MIX, interesting: ['p1'] })
    expect(parseMixConfig({ cap: 10_000 }).cap).toBe(500)
  })
})
