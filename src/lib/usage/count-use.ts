// F133 — count a use of a part of the app, or a step reached, after the response. Server only.
//
// The member is read from the session token here, in the request (after() cannot read cookies); the write runs in
// after(), so no page or action waits on it, and a failed count never fails anything. Signed out: nothing. Whether
// the member shares (search_sharing) or is a builder is decided by usage.log, in the same statement as the write.

import { after } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { viewerId } from '@/lib/auth/viewer'
import { resolveActionContext } from '@/lib/action-context'
import { usageLog, type UsagePart, type FunnelStep } from '@/actions'
import { metroDate } from '@/lib/metro/metro-week'
import { METRO_TIME_ZONE } from '@/lib/metro/metro-time'

export type UsageCount = { part: UsagePart } | { step: FunnelStep }

// What this server instance has already sent today, so a member moving around Explore costs one write per part a
// day, not one per page. Memory only, never stored, emptied when the day turns; the database still dedupes across
// instances.
const SENT_CAP = 20_000
let sentDay = ''
const sent = new Set<string>()
function firstToday(who: string, count: UsageCount): boolean {
  const day = metroDate(new Date(), METRO_TIME_ZONE)
  if (day !== sentDay || sent.size >= SENT_CAP) {
    sent.clear()
    sentDay = day
  }
  const k = `${who}|${'part' in count ? count.part : count.step}`
  if (sent.has(k)) return false
  sent.add(k)
  return true
}

/** Counts for `memberId` when the caller already knows it; otherwise reads the session. Never throws. */
export async function countUse(count: UsageCount, memberId?: string | null): Promise<void> {
  try {
    const who = memberId === undefined ? await viewerId(await createClient()) : memberId
    if (!who || !firstToday(who, count)) return
    const run = () =>
      usageLog(resolveActionContext({ actingMemberId: who }), count)
        .then(() => undefined)
        .catch((e) => console.error('[usage] count failed:', (e as Error).message))
    try {
      after(run)
    } catch {
      void run()
    }
  } catch {
    // Counting a use is never worth an error.
  }
}

/** Which part a Page view is: a post on it, a business Page, or a group. */
export function partForPage(kind: string, focusPost: boolean): UsagePart {
  if (focusPost) return 'posts'
  return kind === 'business' ? 'pages' : 'groups'
}

/** Which parts an Explore load is: the map view, a search or filter, or Explore itself. */
export function partsForExplore(sp: { view?: string; q?: string; category?: string; schedule?: string }): UsagePart[] {
  if (sp.view === 'map') return ['map']
  if ((sp.q ?? '').trim() || sp.category || sp.schedule) return ['search']
  return ['explore']
}
