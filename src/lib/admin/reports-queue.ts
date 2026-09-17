// The operator's queue, read server-side.
//
// `reports` has no client SELECT policy and must not gain one (#12), so this
// goes over DATABASE_URL through the pool — never through PostgREST.
//
// ORDER: oldest hidden first. A hidden photo is a member's content withheld
// from the world before anyone judged it, so the queue is ordered by how long
// that has been true, not by when the report arrived.
//
// WHAT THE REVIEWER SEES, and why it names the poster:
// Don's ruling, 2026-09-17 — "Anyone posting anything to the platform is
// subject to review by the platform's staff." The member-to-member protections
// are untouched; they govern what members learn about each other. This is the
// platform reviewing content posted to it, which the 2026-09-14 line already
// contemplated in as many words: the 12-month legal-name gate is "a render
// gate, not a deletion... the platform keeps knowing who someone is (the
// accountability floor, and the operator's report-review view depends on it)".
//
// The boundary, written in because this is the kind of line that widens on its
// own: this authorises review OF REPORTED CONTENT, by staff, for moderation. It
// is not a licence to browse member data unrelated to a report. Every column
// below is here because judging this report needs it — there is no bio, no
// email, no location, no other Page.
//
// NOTE, checked rather than assumed: **there is no `members.legal_name`
// column.** The ruling of 2026-09-14 describes signup collecting a legal name;
// the schema has `display_name` and `handle` and nothing else identifying. So
// the reviewer sees the display name and the handle, which is all the platform
// holds. If Don wants the legal name in this view, that is a schema change and
// a separate decision, not something to fake here.

import { getPool } from '@/actions/_lib/db'

export interface QueuedReport {
  reportId: string
  /** What the reporter wrote, in their own words. */
  body: string
  reportedAt: Date
  /** Null when the report did not hide anything — see report.create's limits. */
  hiddenAt: Date | null
  groupId: string
  groupName: string
  groupSlug: string | null
  /** The hidden photo. Rendered only behind a deliberate tap. */
  photoUrl: string | null
  /** Who posted it. See the note above — this is all the platform holds. */
  ownerDisplayName: string | null
  ownerHandle: string | null
}

export async function fetchReviewQueue(limit = 50): Promise<QueuedReport[]> {
  const { rows } = await getPool().query(
    `select r.id              as report_id,
            r.body            as body,
            r.created_at      as reported_at,
            g.photo_hidden_at as hidden_at,
            g.id              as group_id,
            g.name            as group_name,
            g.slug            as group_slug,
            g.photo_url       as photo_url,
            m.display_name    as owner_display_name,
            m.handle          as owner_handle
       from public.reports r
       join public.groups  g on g.id = r.subject_id
       left join public.members m on m.id = g.founder_member_id
      where r.reviewed_at is null
        and r.subject_kind = 'group'
      order by g.photo_hidden_at asc nulls last, r.created_at asc
      limit $1`,
    [limit],
  )

  return rows.map((r: Record<string, unknown>) => ({
    reportId: r.report_id as string,
    body: r.body as string,
    reportedAt: r.reported_at as Date,
    hiddenAt: (r.hidden_at as Date | null) ?? null,
    groupId: r.group_id as string,
    groupName: r.group_name as string,
    groupSlug: (r.group_slug as string | null) ?? null,
    photoUrl: (r.photo_url as string | null) ?? null,
    ownerDisplayName: (r.owner_display_name as string | null) ?? null,
    ownerHandle: (r.owner_handle as string | null) ?? null,
  }))
}

/** "3 days" / "4 hours" / "12 minutes" — how long content has been withheld. */
export function hiddenFor(since: Date | null, now: Date): string | null {
  if (!since) return null
  const mins = Math.max(0, Math.floor((now.getTime() - since.getTime()) / 60000))
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'}`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'}`
  const days = Math.floor(hours / 24)
  return `${days} day${days === 1 ? '' : 's'}`
}
