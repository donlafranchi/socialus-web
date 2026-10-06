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
  reportId: string
  /** What the reporter wrote, in their own words. */
  body: string
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
            r.created_at      as reported_at,
            g.photo_hidden_at as hidden_at,
            g.photo_removed_at as removed_at,
            g.id              as group_id,
            g.name            as group_name,
            g.slug            as group_slug,
            g.photo_url       as photo_url,
            m.display_name    as owner_display_name,
            m.handle          as owner_handle
       from public.reports r
       join public.groups  g on g.id = r.subject_id
       left join public.members m on m.id = g.founder_member_id
      where r.subject_kind = 'group'
        -- #280 — builder reports and builder Pages reach only the builder operator.
        and ($2 or (not public.is_builder(r.reporter_member_id) and not public.is_builder(g.founder_member_id)))
      order by (r.reviewed_at is not null),          -- undecided first
               g.photo_hidden_at asc nulls last,
               r.created_at asc
      limit $1`,
    [limit, includeBuilders],
  )

  const history = await fetchHistory(rows.map((r: Record<string, unknown>) => r.report_id as string))

  return rows.map((r: Record<string, unknown>) => ({
    reportId: r.report_id as string,
    body: r.body as string,
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
