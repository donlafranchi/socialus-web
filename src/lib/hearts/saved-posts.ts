// #1171 (socialus-plan #269, Don 2026-11-02) — the member's saved posts, for the Saved list on You. Runs as the member:
// saves are their own rows, and RLS on page_posts drops anything they can no longer see (deleted, hidden, a Page gone).

import type { SupabaseClient } from '@supabase/supabase-js'
import { pagePath } from '@/lib/groups/page-handle'
import { postPath } from '@/lib/posts/post-path'
import { maskEmails, maskEmailsOrNull } from '@/lib/text/contact-info'
import { inferKind, isPostKind, type PostKind } from '@/lib/posts/kinds'

export interface SavedPost {
  postId: string
  href: string
  pageName: string
  headline: string | null
  body: string
  kind: PostKind
  startsAt: string | null
  endsAt: string | null
  where: string | null
  seriesId: string | null
  savedAt: string
  /** Over: it started and has ended (or, with no end, started before today). */
  past: boolean
}

type One<T> = T | T[] | null
const one = <T,>(v: One<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : v)

interface Row {
  created_at: string
  post: One<{
    id: string
    body: string
    headline: string | null
    kind: string | null
    starts_at: string | null
    ends_at: string | null
    series_id: string | null
    url_slug: string | null
    dissolved_at: string | null
    location: One<{ label: string | null }>
    group: One<{ name: string; public_id: string; place_url_slug: string | null; page_url_slug: string | null }>
  }>
}

const isPast = (p: Pick<SavedPost, 'startsAt' | 'endsAt'>, now: Date) =>
  !!p.startsAt && (p.endsAt ? new Date(p.endsAt) < now : new Date(p.startsAt).getTime() < now.getTime() - 6 * 3600e3)

/** Upcoming soonest first; then undated, newest saved first; then past, most recent first. */
export function sortSaved<T extends Pick<SavedPost, 'startsAt' | 'endsAt' | 'savedAt'>>(rows: readonly T[], now: Date = new Date()): (T & { past: boolean })[] {
  const marked = rows.map((r) => ({ ...r, past: isPast(r, now) }))
  const rank = (r: (typeof marked)[number]) => (r.past ? 2 : r.startsAt ? 0 : 1)
  return marked.sort((a, b) => {
    const d = rank(a) - rank(b)
    if (d) return d
    if (rank(a) === 0) return a.startsAt!.localeCompare(b.startsAt!)
    if (rank(a) === 2) return b.startsAt!.localeCompare(a.startsAt!)
    return b.savedAt.localeCompare(a.savedAt)
  })
}

export async function loadSavedPosts(supabase: SupabaseClient, now: Date = new Date()): Promise<SavedPost[]> {
  const { data, error } = await supabase
    .from('saves')
    .select(
      'created_at, post:page_posts(id, body, headline, kind, starts_at, ends_at, series_id, url_slug, dissolved_at, location:locations(label), group:groups(name, public_id, place_url_slug, page_url_slug))',
    )
    .order('created_at', { ascending: false })
    .limit(200)
  if (error || !data) return []
  const rows = (data as unknown as Row[]).flatMap((r): Omit<SavedPost, 'past'>[] => {
    const p = one(r.post)
    const g = p && one(p.group)
    if (!p || !g || p.dissolved_at) return []
    const page = pagePath({ publicId: g.public_id, placeUrlSlug: g.place_url_slug, pageUrlSlug: g.page_url_slug })
    return [
      {
        postId: p.id,
        href: postPath(page, { id: p.id, urlSlug: p.url_slug }),
        pageName: g.name,
        headline: maskEmailsOrNull(p.headline),
        body: maskEmails(p.body),
        kind: isPostKind(p.kind) ? p.kind : inferKind({ wonder: p.kind === 'wonder', startsAt: p.starts_at }),
        startsAt: p.starts_at,
        endsAt: p.ends_at,
        where: one(p.location)?.label ?? null,
        seriesId: p.series_id,
        savedAt: r.created_at,
      },
    ]
  })
  return sortSaved(rows, now)
}
