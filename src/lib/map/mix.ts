// #331 — what the map shows by default: a mix of four buckets (Don,
// 2026-10-05), in proportions the PM tunes in `app_settings.map_mix` without a
// deploy. Revisit with beta data by 2026-11-15.

import type { BrowseResult } from '@/lib/feed/browse-feed'

export const BUCKETS = ['dated', 'new', 'recent', 'interesting'] as const
export type Bucket = (typeof BUCKETS)[number]

export interface MapMixConfig {
  /** The most pins the default map shows. */
  cap: number
  /** Relative shares; zero turns a bucket off. */
  weights: Record<Bucket, number>
  /** "New" means a Page created within this many days. */
  newDays: number
  /** The curated "interesting" Pages, by id. */
  interesting: string[]
}

export const DEFAULT_MIX: MapMixConfig = {
  cap: 60,
  weights: { dated: 1, new: 1, recent: 1, interesting: 1 },
  newDays: 30,
  interesting: [],
}

const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : fallback)

/** A hand-edited row can be wrong; anything missing or malformed falls back to the default. */
export function parseMixConfig(raw: unknown): MapMixConfig {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const w = (r.weights && typeof r.weights === 'object' ? r.weights : {}) as Record<string, unknown>
  return {
    cap: Math.min(500, Math.floor(num(r.cap, DEFAULT_MIX.cap))),
    weights: Object.fromEntries(BUCKETS.map((b) => [b, num(w[b], DEFAULT_MIX.weights[b])])) as Record<Bucket, number>,
    newDays: num(r.newDays, DEFAULT_MIX.newDays),
    interesting: Array.isArray(r.interesting) ? r.interesting.filter((x): x is string => typeof x === 'string') : [],
  }
}

export type MixedResult = BrowseResult & { bucket: Bucket }

/**
 * Each bucket gets its share of the cap; a bucket that runs short hands its
 * room to the others in turn. A result shows once, under the first bucket
 * that claimed it (dated, new, recent, interesting).
 */
export function buildMix(buckets: Record<Bucket, BrowseResult[]>, cfg: MapMixConfig): MixedResult[] {
  const total = BUCKETS.reduce((n, b) => n + cfg.weights[b], 0)
  if (total === 0 || cfg.cap === 0) return []
  const seen = new Set<string>()
  const queues = Object.fromEntries(
    BUCKETS.map((b) => [b, cfg.weights[b] > 0 ? buckets[b].filter((r) => r.longitude != null && r.latitude != null) : []]),
  ) as Record<Bucket, BrowseResult[]>
  const out: MixedResult[] = []
  const take = (b: Bucket, n: number) => {
    let taken = 0
    while (taken < n && queues[b].length > 0 && out.length < cfg.cap) {
      const r = queues[b].shift()!
      const key = `${r.resultKind}:${r.resultId}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ ...r, bucket: b })
      taken++
    }
    return taken
  }
  for (const b of BUCKETS) take(b, Math.round((cfg.cap * cfg.weights[b]) / total))
  // Shortfall: round-robin over what's left, so no one bucket floods the spare room.
  let progress = true
  while (out.length < cfg.cap && progress) {
    progress = false
    for (const b of BUCKETS) if (cfg.weights[b] > 0 && take(b, 1) > 0) progress = true
  }
  return out
}

/** How many shown pins came from each bucket. */
export function bucketCounts(mix: readonly MixedResult[]): Record<Bucket, number> {
  const c = Object.fromEntries(BUCKETS.map((b) => [b, 0])) as Record<Bucket, number>
  for (const r of mix) c[r.bucket]++
  return c
}
