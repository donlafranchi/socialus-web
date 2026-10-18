// #945 — the member's reminders as lines for You → Alerts: "Page, every time" or "Page, Sat, Oct 24, 7:00 PM".
// Reads under the member's session: their own reminders, and the posts any visitor of those Pages may read.

import type { SupabaseClient } from '@supabase/supabase-js'
import { canonicalPagePath } from '@/lib/groups/page-handle'
import { NOTIFY_COPY as C } from '@/lib/notify/push/copy'
import { METRO_TIME_ZONE } from '@/lib/metro/metro-time'

type PostRow = { id: string; series_id: string | null; starts_at: string | null; group: { name: string; public_id: string } | { name: string; public_id: string }[] | null }

const when = (iso: string) =>
  new Intl.DateTimeFormat('en-US', { timeZone: METRO_TIME_ZONE, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(iso)).replace(/\s/g, ' ')

export async function loadReminderList(supabase: SupabaseClient): Promise<{ id: string; label: string; href: string }[]> {
  const { data: rs } = await supabase.from('post_reminders').select('id, post_id, series_id').order('created_at', { ascending: false })
  const reminders = (rs ?? []) as { id: string; post_id: string | null; series_id: string | null }[]
  if (reminders.length === 0) return []
  const postIds = reminders.map((r) => r.post_id).filter((x): x is string => !!x)
  const seriesIds = reminders.map((r) => r.series_id).filter((x): x is string => !!x)
  const ors = [postIds.length ? `id.in.(${postIds.join(',')})` : null, seriesIds.length ? `series_id.in.(${seriesIds.join(',')})` : null].filter(Boolean).join(',')
  const { data: ps } = await supabase.from('page_posts').select('id, series_id, starts_at, group:groups(name, public_id)').or(ors).is('dissolved_at', null)
  const posts = (ps ?? []) as PostRow[]
  const page = (p: PostRow) => (Array.isArray(p.group) ? p.group[0] : p.group) ?? null
  return reminders.flatMap((r) => {
    const p = posts.find((x) => (r.post_id ? x.id === r.post_id : x.series_id === r.series_id))
    const g = p && page(p)
    if (!p || !g) return []
    const label = r.series_id ? C.remindersEvery(g.name) : C.remindersOne(g.name, p.starts_at ? when(p.starts_at) : '')
    return [{ id: r.id, label, href: canonicalPagePath(g.public_id) }]
  })
}
