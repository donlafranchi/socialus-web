// #388 — what the builder-content page shows: the switch and how much there is.
// Server-side over DATABASE_URL; builder_content and builders have no client policy.

import { getPool } from '@/actions/_lib/db'

export interface BuilderContentState {
  visible: boolean
  changedAt: Date
  pages: number
  posts: number
}

export async function fetchBuilderContentState(): Promise<BuilderContentState> {
  const { rows } = await getPool().query<{ visible: boolean; changed_at: Date; pages: number; posts: number }>(
    `select c.visible, c.changed_at,
            (select count(*)::int from public.groups g join public.builders b on b.member_id = g.founder_member_id) as pages,
            (select count(*)::int from public.page_posts p join public.groups g on g.id = p.group_id
               join public.builders b on b.member_id = g.founder_member_id where p.dissolved_at is null) as posts
       from public.builder_content c`,
  )
  const r = rows[0]!
  return { visible: r.visible, changedAt: r.changed_at, pages: r.pages, posts: r.posts }
}
