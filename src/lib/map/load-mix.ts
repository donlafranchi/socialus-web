// #331 — the default map's pins, server-side: the PM's settings row, four
// reads from browse_feed (one per bucket), the mix, and a log of what was shown.

import type { SupabaseClient } from '@supabase/supabase-js'
import { getBrowseFeed, type BrowseResult } from '@/lib/feed/browse-feed'
import { getPool } from '@/actions/_lib/db'
import { BUCKETS, buildMix, parseMixConfig, type Bucket, type MixedResult } from './mix'

type RpcClient = Pick<SupabaseClient, 'rpc' | 'from'>

const PER_BUCKET = 100
const DAY = 24 * 60 * 60 * 1000

export async function loadMapMix(supabase: RpcClient, metroId: string, now = new Date()): Promise<MixedResult[]> {
  const { data } = await supabase.from('app_settings').select('value').eq('key', 'map_mix').maybeSingle()
  const cfg = parseMixConfig((data as { value?: unknown } | null)?.value)
  const scope = { metroId }
  const read = (b: Bucket): Promise<BrowseResult[]> => {
    if (cfg.weights[b] === 0) return Promise.resolve([])
    if (b === 'dated')
      return getBrowseFeed(supabase, { scope, resultKinds: ['post'], startsFrom: now.toISOString(), sort: 'soonest', limit: PER_BUCKET })
    if (b === 'new')
      return getBrowseFeed(supabase, {
        scope,
        resultKinds: ['page'],
        createdAfter: new Date(now.getTime() - cfg.newDays * DAY).toISOString(),
        sort: 'newest',
        limit: PER_BUCKET,
      })
    if (b === 'recent') return getBrowseFeed(supabase, { scope, sort: 'recent', limit: PER_BUCKET })
    // Interesting: the curated Pages, read through the same predicate a follow set uses.
    if (cfg.interesting.length === 0) return Promise.resolve([])
    return getBrowseFeed(supabase, { scope, audience: { audience: 'following', following: cfg.interesting }, sort: 'recent', limit: PER_BUCKET })
  }
  // A failed bucket costs that bucket, not the map.
  const lists = await Promise.all(BUCKETS.map((b) => read(b).catch(() => [] as BrowseResult[])))
  const mix = buildMix(Object.fromEntries(BUCKETS.map((b, i) => [b, lists[i]!])) as Record<Bucket, BrowseResult[]>, cfg)
  await logMix(metroId, mix, now).catch((e) => console.error('[map-mix] log failed:', (e as Error).message))
  return mix
}

/** One row per day, metro, bucket and thing shown, counted. No member, no session. */
async function logMix(metroId: string, mix: readonly MixedResult[], now: Date) {
  if (mix.length === 0) return
  const day = now.toISOString().slice(0, 10)
  await getPool().query(
    `insert into public.map_mix_log (day, metro_id, bucket, result_kind, result_id)
     select $1::date, $2::uuid, b, k, r::uuid from unnest($3::text[], $4::text[], $5::text[]) as t(b, k, r)
     on conflict (day, metro_id, bucket, result_kind, result_id) do update set shown = public.map_mix_log.shown + 1`,
    [day, metroId, mix.map((m) => m.bucket), mix.map((m) => m.resultKind), mix.map((m) => m.resultId)],
  )
}
