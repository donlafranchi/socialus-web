'use server'

// #909 — search demand. Explore calls logSearchAction once a search has settled; You flips the switch.
// A log never fails the search: errors are swallowed here.

import { cookies, headers } from 'next/headers'
import { createClient } from '@/lib/supabase-server'
import { resolveActionContext, resolveAnonymousActionContext } from '@/lib/action-context'
import { memberSearchSharingSet, searchDemandLog } from '@/actions'
import { SEED_COOKIE } from '@/lib/browse/session-shuffle'
import { SEARCH_QUERY_MIN } from '@/lib/search/demand'

async function browserKey(): Promise<string> {
  const seed = (await cookies()).get(SEED_COOKIE)?.value
  if (seed) return `seed:${seed}`
  const h = await headers()
  const ip = (h.get('x-forwarded-for') ?? '').split(',')[0]?.trim() || 'unknown'
  return `ip:${ip}|${h.get('user-agent') ?? ''}`
}

export async function logSearchAction(query: string, metroSlug: string | null, placeId: string | null, resultCount: number): Promise<void> {
  if (typeof query !== 'string' || query.trim().length < SEARCH_QUERY_MIN) return
  try {
    const supabase = await createClient()
    const { data } = await supabase.auth.getUser()
    const memberId = data.user?.id ?? null
    const ctx = memberId ? resolveActionContext({ actingMemberId: memberId }) : resolveAnonymousActionContext()
    await searchDemandLog(ctx, { query, metroSlug, placeId, resultCount, searcher: memberId ?? (await browserKey()) })
  } catch {
    // Counting a search is never worth an error on Explore.
  }
}

export async function setSearchSharingAction(on: boolean): Promise<{ ok: true; on: boolean } | { ok: false }> {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) return { ok: false }
  try {
    const r = await memberSearchSharingSet(resolveActionContext({ actingMemberId: data.user.id }), { on })
    return { ok: true, on: r.on }
  } catch {
    return { ok: false }
  }
}
