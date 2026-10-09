// F102 criterion 12 (ruled B) — the AI restores severity-4 reported content on
// its own, narrowly. Called by runAssessment after it stores the reads that
// followed a poster's answer. Not a registered verb: nobody invokes it, and its
// actor is the AI, which is not a member (report_decisions.decided_by_ai).
//
// THE GATE is restore-gate.ts. This reads the facts, records every evaluation in
// report_ai_restore_checks (so shadow shows what the AI WOULD have done), and
// acts only when the gate says so: ai_mode = 'live' AND the operator-set
// moderation_settings.severity4_restore_cleared. Nothing here sets that flag.
//
// The restore is a decision row like a person's, so a person's confirm or undo
// is a later row (report.decide / report.reverse) and nothing is ever mutated.
// No group_events row: that table's actor is a member and the AI is not one.

import { withTransaction } from '../_lib/db'
import { SEVERITY_OF_REPORT_CATEGORY, type ReportCategory } from '@/lib/reports/categories'
import { HAIKU, SONNET, type Read } from '@/lib/moderation/assess'
import { restoreVerdict, type RestoreRead } from '@/lib/moderation/restore-gate'
import { insertDecision, project, projectReportRow, type SubjectKind } from './review'

export type RestoreResult = 'restored' | 'would_restore' | 'blocked' | 'skipped'

interface Deps {
  now?: () => Date
  /** Is this poster's content being reported in a coordinated way (F102 criterion 8)? */
  isCoordinated?: (posterId: string | null) => Promise<boolean>
}

async function posterIsCoordinated(posterId: string | null): Promise<boolean> {
  if (!posterId) return false
  const { fetchReviewQueue } = await import('@/lib/admin/reports-queue')
  const { coordinatedPosters } = await import('@/lib/admin/review-subjects')
  return coordinatedPosters(await fetchReviewQueue(200, { includeBuilders: true })).has(posterId)
}

const pick = (reads: Read[], model: string): RestoreRead | null => reads.find((r) => r.model === model) ?? null

export async function autoRestoreAfterAssessment(reportId: string, reads: Read[], deps: Deps = {}): Promise<RestoreResult> {
  const { now = () => new Date(), isCoordinated = posterIsCoordinated } = deps

  return withTransaction(async (client) => {
    const subjectRes = await client.query<{ subject_kind: SubjectKind; subject_id: string; group_id: string; poster_id: string | null }>(
      `select r.subject_kind, r.subject_id, pg.id as group_id, pg.founder_member_id as poster_id
         from public.reports r
         left join public.groups g on r.subject_kind in ('group', 'page_picture') and g.id = r.subject_id
         left join public.page_posts p on r.subject_kind in ('post', 'post_photo') and p.id = r.subject_id
         join public.groups pg on pg.id = coalesce(p.group_id, g.id)
        where r.id = $1
          for update of r`,
      [reportId],
    )
    const subject = subjectRes.rows[0]
    if (!subject) return 'skipped'

    // Every open report on the subject: the decision covers them all, as a person's tap does.
    const open = (
      await client.query<{ id: string; category: ReportCategory | null }>(
        `select r.id, r.category
           from public.reports r
          where r.subject_kind = $1 and r.subject_id = $2
            and not exists (select 1 from public.report_decisions d where d.report_id = r.id)
            for update of r`,
        [subject.subject_kind, subject.subject_id],
      )
    ).rows
    if (!open.some((r) => r.id === reportId)) return 'skipped'

    const settings = (await client.query<{ ai_mode: string; severity4_restore_cleared: boolean }>(
      `select ai_mode, severity4_restore_cleared from public.moderation_settings limit 1`,
      [],
    )).rows[0]
    const answered = (await client.query<{ answered: boolean }>(
      `select exists (
         select 1 from public.report_answers a
           join public.member_notices n on n.id = a.notice_id
          where n.subject_kind = $1 and n.subject_id = $2 and a.kind = 'wrong'
       ) as answered`,
      [subject.subject_kind, subject.subject_id],
    )).rows[0]?.answered === true

    const facts = {
      aiMode: settings?.ai_mode === 'live' ? ('live' as const) : ('shadow' as const),
      cleared: settings?.severity4_restore_cleared === true,
      reporterSeverities: open.map((r) => (r.category ? SEVERITY_OF_REPORT_CATEGORY[r.category] : null)),
      answered,
      coordinated: false,
      haiku: pick(reads, HAIKU),
      sonnet: pick(reads, SONNET),
    }
    // Last, and only when everything else passed: it reads the whole queue. A failure blocks.
    if (restoreVerdict(facts).wouldRestore) {
      try {
        facts.coordinated = await isCoordinated(subject.poster_id)
      } catch {
        facts.coordinated = true
      }
    }
    const verdict = restoreVerdict(facts)
    const result: RestoreResult = verdict.act ? 'restored' : verdict.wouldRestore ? 'would_restore' : 'blocked'

    await client.query(
      `insert into public.report_ai_restore_checks (report_id, result, blocked_by) values ($1, $2, $3)`,
      [reportId, result, verdict.blockedBy],
    )
    if (!verdict.act) return result

    const at = now()
    const note = `Restored by AI: the poster answered; Haiku ${facts.haiku!.confidence.toFixed(2)} and Sonnet ${facts.sonnet!.confidence.toFixed(2)} both approve.`
    for (const r of open) {
      await insertDecision(client, { reportId: r.id, operator: null, now: at, outcome: 'restored', reasonCode: 'nothing_wrong', reasonNote: note })
      await projectReportRow(client, r.id, 'restored', null, at)
    }
    await project(client, { kind: subject.subject_kind, id: subject.subject_id, groupId: subject.group_id }, 'restored', at)
    return 'restored'
  })
}
