// The operator's queue, read server-side.
//
// `reports` has no client SELECT policy and must not gain one (#12), so this
// goes over DATABASE_URL through the pool — never through PostgREST.
//
// ORDER: undecided first, then oldest hidden. A hidden photo is a member's
// content withheld from the world before anyone judged it, so that clock is the
// one that matters.
//
// DECIDED REPORTS STAY IN THE LIST, below the undecided ones. Every decision is
// reversible, and you cannot reverse what you cannot see — hiding decided
// reports would make undo a support request, which is exactly what Don ruled
// against.
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
import type { ReportCategory } from '@/lib/reports/categories'

export interface PastDecision {
  decisionId: string
  outcome: 'restored' | 'removed'
  reasonCode: string
  reasonNote: string | null
  decidedAt: Date
  decidedByName: string | null
  /** The decision this one undid, if it was a reversal. */
  reversesDecisionId: string | null
  /** True once something else has undone THIS one — it cannot be undone twice. */
  alreadyReversed: boolean
}

export interface QueuedReport {
  /** F078 criterion 1 — a Post or a Page's photo. Absent means a Page photo. */
  subjectKind?: 'group' | 'post'
  postId?: string
  /** What was reported, in its own words, for the row's excerpt. */
  contentText?: string | null
  /** The member who posted what was reported (operator-only). */
  posterId?: string
  /** F102 — the poster's one answer to the hide, if they gave it. */
  answer?: { kind: 'fix_and_repost' | 'wrong'; reason: 'mistaken' | 'malicious' | 'misusing_reports' | null; note: string | null } | null
  /** F102 — how old the reporter's account was when they reported. */
  reporterAgeDays?: number
  /** F102 criterion 5 — counters on the act of reporting; operator-only, used by nothing outside the report path. */
  reporter?: { filed: number; upheld: number; dismissed: number; open: number }
  reportId: string
  /** What the reporter wrote, in their own words. */
  body: string
  /** The reason the reporter chose; null on reports filed before F078 criterion 9. */
  category: ReportCategory | null
  reportedAt: Date
  /** Null when the report did not hide anything — see report.create's limits. */
  hiddenAt: Date | null
  /** Non-null means the photo is currently removed. Reversible. */
  removedAt: Date | null
  groupId: string
  groupName: string
  groupSlug: string | null
  /** The hidden photo. Rendered only behind a deliberate tap. */
  photoUrl: string | null
  /** Who posted it. See the note above — this is all the platform holds. */
  ownerDisplayName: string | null
  ownerHandle: string | null
  /**
   * What has happened to this before, newest first.
   *
   * On the item, not in a separate log: a reversal made blind is how two
   * reviewers ping-pong. The reviewer should see what was decided and by whom
   * before deciding again.
   */
  history: PastDecision[]
}

/**
 * Decisions for a set of reports, newest first.
 *
 * `report_decisions` is the source of truth; `reports.reviewed_at` and friends
 * are a projection of its latest row.
 */
async function fetchHistory(reportIds: string[]): Promise<Map<string, PastDecision[]>> {
  const byReport = new Map<string, PastDecision[]>()
  if (reportIds.length === 0) return byReport

  const { rows } = await getPool().query(
    `select d.id,
            d.report_id,
            d.outcome,
            d.reason_code,
            d.reason_note,
            d.decided_at,
            d.reverses_decision_id,
            m.display_name as decided_by_name,
            exists (
              select 1 from public.report_decisions x
               where x.reverses_decision_id = d.id
            ) as already_reversed
       from public.report_decisions d
       left join public.members m on m.id = d.decided_by_member_id
      where d.report_id = any($1::uuid[])
      order by d.decided_at desc`,
    [reportIds],
  )

  for (const r of rows as Record<string, unknown>[]) {
    const id = r.report_id as string
    const list = byReport.get(id) ?? []
    list.push({
      decisionId: r.id as string,
      outcome: r.outcome as 'restored' | 'removed',
      reasonCode: r.reason_code as string,
      reasonNote: (r.reason_note as string | null) ?? null,
      decidedAt: r.decided_at as Date,
      decidedByName: (r.decided_by_name as string | null) ?? null,
      reversesDecisionId: (r.reverses_decision_id as string | null) ?? null,
      alreadyReversed: Boolean(r.already_reversed),
    })
    byReport.set(id, list)
  }
  return byReport
}

export async function fetchReviewQueue(
  limit = 50,
  { includeBuilders = false }: { includeBuilders?: boolean } = {},
): Promise<QueuedReport[]> {
  const { rows } = await getPool().query(
    `select r.id              as report_id,
            r.body            as body,
            r.category        as category,
            r.created_at      as reported_at,
            r.subject_kind    as subject_kind,
            p.id              as post_id,
            -- A post is hidden or removed on its own; a Page's photo on the Page.
            case when p.id is not null then p.hidden_at else g.photo_hidden_at end as hidden_at,
            case when p.id is not null then p.removed_at else g.photo_removed_at end as removed_at,
            pg.id             as group_id,
            pg.name           as group_name,
            pg.slug           as group_slug,
            case when p.id is not null then null else g.photo_url end as photo_url,
            case when p.id is not null then p.body else g.description end as content_text,
            m.display_name    as owner_display_name,
            m.handle          as owner_handle,
            pg.founder_member_id as poster_id,
            (select json_build_object('kind', a.kind, 'reason', a.wrong_reason, 'note', a.note)
               from public.report_answers a
               join public.member_notices n on n.id = a.notice_id
              where n.subject_kind = r.subject_kind and n.subject_id = r.subject_id
              order by a.created_at desc limit 1) as answer,
            extract(epoch from (r.created_at - rm.created_at)) / 86400 as reporter_age_days,
            (select count(*) from public.reports x where x.reporter_member_id = r.reporter_member_id)::int as r_filed,
            (select count(*) from public.reports x where x.reporter_member_id = r.reporter_member_id and x.reviewed_at is null and x.removed_at is null)::int as r_open,
            (select count(*) from public.reports x where x.reporter_member_id = r.reporter_member_id and x.outcome = 'removed')::int as r_upheld,
            (select count(*) from public.reports x where x.reporter_member_id = r.reporter_member_id and x.outcome = 'restored')::int as r_dismissed
       from public.reports r
       left join public.members rm on rm.id = r.reporter_member_id
       left join public.groups g     on r.subject_kind = 'group' and g.id = r.subject_id
       left join public.page_posts p on r.subject_kind = 'post'  and p.id = r.subject_id
       join public.groups pg         on pg.id = coalesce(g.id, p.group_id)
       left join public.members m on m.id = pg.founder_member_id
      where (g.id is not null or p.id is not null)
        -- #280 — builder reports and builder Pages reach only the builder operator.
        and ($2 or (not public.is_builder(r.reporter_member_id) and not public.is_builder(pg.founder_member_id)))
      order by (r.reviewed_at is not null),          -- undecided first
               case when p.id is not null then p.hidden_at else g.photo_hidden_at end asc nulls last,
               r.created_at asc
      limit $1`,
    [limit, includeBuilders],
  )

  const history = await fetchHistory(rows.map((r: Record<string, unknown>) => r.report_id as string))

  return rows.map((r: Record<string, unknown>) => ({
    subjectKind: ((r.subject_kind as string) === 'post' ? 'post' : 'group') as 'group' | 'post',
    postId: (r.post_id as string | null) ?? undefined,
    contentText: (r.content_text as string | null) ?? null,
    posterId: (r.poster_id as string | null) ?? undefined,
    answer: (r.answer as QueuedReport['answer']) ?? null,
    reporterAgeDays: r.reporter_age_days === null ? undefined : Number(r.reporter_age_days),
    reporter: { filed: Number(r.r_filed), upheld: Number(r.r_upheld), dismissed: Number(r.r_dismissed), open: Number(r.r_open) },
    reportId: r.report_id as string,
    body: r.body as string,
    category: (r.category as ReportCategory | null) ?? null,
    reportedAt: r.reported_at as Date,
    hiddenAt: (r.hidden_at as Date | null) ?? null,
    removedAt: (r.removed_at as Date | null) ?? null,
    groupId: r.group_id as string,
    groupName: r.group_name as string,
    groupSlug: (r.group_slug as string | null) ?? null,
    photoUrl: (r.photo_url as string | null) ?? null,
    ownerDisplayName: (r.owner_display_name as string | null) ?? null,
    ownerHandle: (r.owner_handle as string | null) ?? null,
    history: history.get(r.report_id as string) ?? [],
  }))
}

export { hiddenFor } from './hidden-for'

/** F102 criterion 11 — answers the posters gave this week, and reporters now in a cool-down (two dismissed in 30 days, the latest under 14 days ago). */
export async function fetchWeekSummary(): Promise<{ answers: number; coolDowns: number }> {
  const { rows } = await getPool().query(
    `select
       (select count(*)::int from public.report_answers where created_at > now() - interval '7 days') as answers,
       (select count(*)::int from (
          select r.reporter_member_id
            from (select distinct on (d.report_id) d.report_id, d.outcome, d.decided_at
                    from public.report_decisions d order by d.report_id, d.decided_at desc) x
            join public.reports r on r.id = x.report_id
           where x.outcome = 'restored' and x.decided_at > now() - interval '30 days'
           group by r.reporter_member_id
          having count(*) >= 2 and max(x.decided_at) > now() - interval '14 days') c) as cool_downs`,
  )
  return { answers: Number(rows[0]?.answers ?? 0), coolDowns: Number(rows[0]?.cool_downs ?? 0) }
}
