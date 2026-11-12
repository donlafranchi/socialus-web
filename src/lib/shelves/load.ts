// F121 — Explore's shelves for one reader: the rows that are on, arranged for this member today, each filled by
// one browse_feed read in parallel. Signed out there are none: they are arranged from the member's interests and
// follows, the personal rows F134.2 keeps for members. A failed read costs that shelf, never Explore.

import type { SupabaseClient } from '@supabase/supabase-js'
import { getBrowseFeed, type BrowseResult, type BrowseScope } from '@/lib/feed/browse-feed'
import { resolveFollowedPageIds } from '@/lib/feed/followed-pages'
import { INTEREST_VOCAB } from '@/lib/onboarding/interest-vocab'
import { metroDate } from '@/lib/metro/metro-week'
import { METRO_TIME_ZONE } from '@/lib/metro/metro-time'
import { arrangeShelves, feedArgs, fillShelves, SHELF_SIZE, type Shelf, type ShelfRow } from './shelves'

export interface FilledShelf {
  id: string
  logId: string
  title: string
  items: BrowseResult[]
}

// Enough to fill a shelf after the items earlier shelves took and the samples the cap leaves out.
const READ_SIZE = SHELF_SIZE * 3
// Shelves stream in after Explore; a few reads at a time keep them from crowding the main feed's connections.
const AT_ONCE = 4

async function inBatches<T, R>(items: readonly T[], size: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = []
  for (let i = 0; i < items.length; i += size) out.push(...(await Promise.all(items.slice(i, i + size).map(fn))))
  return out
}

type Row = {
  id: string
  name: string
  query: ShelfRow['query']
  lead_days: number | null
  place: ShelfRow['place']
  fixed_order: number | null
  season_start: string | null
  season_end: string | null
  kind: ShelfRow['kind']
}

export async function loadShelves(
  supabase: Pick<SupabaseClient, 'rpc' | 'from'>,
  { scope, memberId, now = new Date() }: { scope: BrowseScope; memberId: string | null; now?: Date },
): Promise<FilledShelf[]> {
  if (!memberId) return []
  const [rows, interests, follows] = await Promise.all([
    supabase.from('shelves').select('id, name, query, lead_days, place, fixed_order, season_start, season_end, kind').eq('enabled', true),
    supabase.from('member_interests').select('tag').eq('member_id', memberId),
    resolveFollowedPageIds(supabase, memberId).catch(() => [] as string[]),
  ])
  if (rows.error) {
    console.error('[shelves] read failed:', rows.error.message)
    return []
  }
  const own = new Set(((interests.data ?? []) as { tag: string }[]).map((r) => r.tag))
  const shelves = arrangeShelves(
    ((rows.data ?? []) as Row[]).map((r) => ({
      id: r.id,
      name: r.name,
      query: r.query,
      leadDays: r.lead_days,
      place: r.place,
      fixedOrder: r.fixed_order,
      seasonStart: r.season_start,
      seasonEnd: r.season_end,
      kind: r.kind,
    })),
    { today: metroDate(now, METRO_TIME_ZONE), member: memberId, interests: INTEREST_VOCAB.filter((t) => own.has(t.tag)) },
  )
  const reads = await inBatches(shelves, AT_ONCE, (s) => read(supabase, s, scope, follows, now))
  return fillShelves(shelves, reads, now).map(({ shelf, items }) => ({ id: shelf.id, logId: shelf.logId, title: shelf.title, items }))
}

async function read(supabase: Pick<SupabaseClient, 'rpc' | 'from'>, s: Shelf, scope: BrowseScope, follows: string[], now: Date): Promise<BrowseResult[]> {
  if (s.query.audience === 'following' && follows.length === 0) return []
  const args = feedArgs(s, now)
  try {
    return await getBrowseFeed(supabase, {
      scope,
      resultKinds: ['post'],
      ...(s.query.audience === 'following' ? { audience: { audience: 'following', following: follows } } : {}),
      tags: args.tags ?? null,
      anyOf: args.anyOf ?? null,
      postKinds: args.postKinds ?? null,
      startsFrom: args.startsFrom,
      startsBefore: args.startsBefore,
      sort: args.startsFrom ? 'soonest' : 'recent',
      limit: READ_SIZE,
    })
  } catch (error) {
    console.error(`[shelves] ${s.id} failed:`, (error as Error).message)
    return []
  }
}
