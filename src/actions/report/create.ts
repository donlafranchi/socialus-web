// T159 (Issue #61) — report.create
// Scenario: planning/scenario-F058.md — "a member reports something, and the
// operator can take a photo down"
//
// The server half of "hidden immediately on flag". One handler: it stores the
// report, writes the event, and — when the limits below allow — hides the
// Page's photo, all in one transaction.
//
// Hiding is a projection concern, never a deletion. `photo_hidden_at` is set;
// `photo_url` and the storage object are untouched. That is what makes a
// restore possible, and it is why the read path goes through
// `visiblePhotoUrl()` (src/lib/groups/visible-photo-url.ts) rather than
// reading `photo_url` directly.
//
// Nothing here renders. No counter, no badge, no ordering change, and no
// notification to the reported party. What the owner sees is T160's job and is
// deliberately a separate ticket.
//
// This is also the front door for impersonation reports. One handler, free
// text, no taxonomy: at this density the operator learns more from what people
// write than from a taxonomy guessed in advance.

import { z } from 'zod'
import { defineHandler } from '../_lib/handler'
import { ValidationError, AuthorizationError, NotFoundError } from '../_lib/errors'
import { REPORT_CATEGORY_VALUES, URGENT_CATEGORIES, categoryLabel } from '@/lib/reports/categories'
import { textOperator } from '@/lib/notify/operator-sms'
import { hiddenNoticeMessage } from '@/lib/reports/notices'
import { withTransaction } from '../_lib/db'
import { appendEvent } from '../_lib/event-log'
import type { ActionContext } from '../_lib/context'

// Matches the schema CHECK in 20260913211209_reports_and_photo_hiding.sql.
const BODY_MAX_LENGTH = 2000

// A member with this many *open* (unreviewed) reports files the next one
// without it hiding anything. Capacity returns as the operator reviews.
// This never blocks reporting — it decouples the hide from an unbounded
// reporter, so one person cannot hide the metro.
const MAX_OPEN_REPORTS_PER_REPORTER = 5

// THE REFUSAL CAPS (2026-09-18). The one above only withholds the auto-hide;
// the report is still stored, so an unbounded reporter could still fill the
// operator's queue. Report-bombing a business is the specific risk Don named,
// and requiring an account is what makes these caps possible at all — an
// account is persistent and rate-limitable, an anonymous reporter is neither.
// That is the point of the wall: not identity, continuity.
//
// Deliberately well above ordinary use. Someone with 20 open reports is not
// reporting in good faith, and someone filing a third report on the same Page
// they have already reported twice is not adding information.
//
// Constants, not configuration: a threshold in code is reversible in one edit,
// a threshold in the schema is a migration and a production apply.
const MAX_OPEN_REPORTS_TOTAL = 20
const MAX_REPORTS_PER_SUBJECT = 2

export const reportCreateInput = z.object({
  // 'group' is the only value today. Posts join when posts exist; Items never
  // do (model.md § There are no Items).
  subjectKind: z.literal('group'),
  // F078 criterion 9 — no report without a reason the reporter chose.
  category: z.enum(REPORT_CATEGORY_VALUES),
  subjectId: z.string().uuid(),
  // Bounded generously here as a guard against absurd input; the real limit is
  // applied to the trimmed body below, so a 2000-character report that happens
  // to arrive with a trailing newline is not refused for being 2001 long.
  body: z.string().min(1).max(BODY_MAX_LENGTH * 2),
})

export type ReportCreateInput = z.infer<typeof reportCreateInput>

export interface ReportCreateResult {
  reportId: string
  /**
   * Whether this report hid the photo. For the server and the tests only —
   * no surface renders it, the reporter's included. Telling the reporter
   * would disclose that a Page is already reported, already locked, or that
   * they have hit their own cap, and F058 acceptance 2 is that a report
   * changes nothing visible to anyone.
   */
  photoHidden: boolean
}

export const reportCreate = defineHandler(
  'report.create',
  reportCreateInput,
  async (ctx: ActionContext, input: ReportCreateInput): Promise<ReportCreateResult> => {
    // Sign-in required. Anonymous reporting is out of v1: a report names a
    // member and describes what someone believes they did wrong, and an
    // unattributable one cannot be rate-limited or weighed.
    if (!ctx.actingMemberId || ctx.actingMemberId === 'self-bootstrap') {
      throw new AuthorizationError(
        'report.create: a signed-in member is required; anonymous reporting is out of v1',
      )
    }
    const reporterMemberId = ctx.actingMemberId

    // The schema's CHECK bounds length but permits whitespace-only text. An
    // empty report tells the operator nothing, so the handler trims — and
    // then applies the real bound, because trimming is what decides which
    // side of it the body falls on.
    const body = input.body.trim()
    if (body.length === 0) {
      throw new ValidationError('report.create: body must not be empty')
    }
    if (body.length > BODY_MAX_LENGTH) {
      throw new ValidationError(
        `report.create: body must be ${BODY_MAX_LENGTH} characters or fewer`,
      )
    }

    let textAfterCommit = false
    const result = await withTransaction(async (client) => {
      // `reports.subject_id` carries no foreign key — it is polymorphic by
      // design, so posts join later without a change of shape. The handler is
      // what keeps it honest.
      const subjectRes = await client.query<{
        id: string
        photo_url: string | null
        photo_hidden_at: Date | null
        photo_hide_locked_url: string | null
        builder_on_real: boolean
        reporter_is_builder: boolean
        founder_member_id: string
        name: string
        hide_bar: string | number
      }>(
        // #280 — a builder's report on a real Page is stored and queued, and
        // never hides anything a real member sees.
        `select id, photo_url, photo_hidden_at, photo_hide_locked_url,
                public.is_builder($2) and not public.is_builder(founder_member_id) as builder_on_real,
                public.is_builder($2) as reporter_is_builder,
                founder_member_id, name,
                -- F078 criterion 7: the metro's bar, 0 when the metro cannot be
                -- resolved. min() so an overlap leans toward hiding.
                coalesce((select min(mp.hide_bar)
                            from public.locations l
                            join public.metro_polygons mp on st_intersects(l.geography, mp.geography)
                           where l.id = groups.anchor_location_id), 0) as hide_bar
           from public.groups
          where id = $1`,
        [input.subjectId, reporterMemberId],
      )
      const subject = subjectRes.rows[0]
      if (!subject) {
        throw new NotFoundError(`report.create: group ${input.subjectId} not found`)
      }

      // The two counts are read BEFORE the insert, so this report never counts
      // itself against its own limits.
      const priorRes = await client.query<{ count: string }>(
        `select count(*)::text as count
           from public.reports
          where reporter_member_id = $1
            and subject_kind = $2
            and subject_id = $3
            and removed_at is null`,
        [reporterMemberId, input.subjectKind, input.subjectId],
      )
      const priorBySameMember = Number(priorRes.rows[0]?.count ?? '0')

      const openRes = await client.query<{ count: string }>(
        `select count(*)::text as count
           from public.reports
          where reporter_member_id = $1
            and reviewed_at is null
            and removed_at is null`,
        [reporterMemberId],
      )
      const openByReporter = Number(openRes.rows[0]?.count ?? '0')

      // Refuse before writing. A stored report that nobody will ever read is
      // still a row in the operator's queue.
      if (openByReporter >= MAX_OPEN_REPORTS_TOTAL) {
        throw new ValidationError(
          'report.create: you have a lot of reports open already — we will get to them before taking more',
        )
      }
      if (priorBySameMember >= MAX_REPORTS_PER_SUBJECT) {
        throw new ValidationError(
          'report.create: you have already reported this one — we have it',
        )
      }

      const insertRes = await client.query<{ id: string }>(
        `insert into public.reports
           (reporter_member_id, subject_kind, subject_id, body, category, created_at)
         values ($1, $2, $3, $4, $5, $6)
         returning id`,
        [reporterMemberId, input.subjectKind, input.subjectId, body, input.category, ctx.now()],
      )
      const reportId = insertRes.rows[0]!.id

      const txCtx: ActionContext = { ...ctx, db: client }

      // The event names no reporter and carries no body. `acting_member_id`
      // already carries the reporter for the operator's server-side read, and
      // the migration that accompanies this ticket keeps that column out of
      // every browser read path.
      await appendEvent(txCtx, 'group_events', {
        group_id: input.subjectId,
        event_kind: 'group.reported',
        payload: { report_id: reportId, subject_kind: input.subjectKind },
      })

      // The limits. Every one of them stores the report and queues it for the
      // operator; what they withhold is only the automatic hide.
      //
      //   nothing to hide     — no photo, or already hidden.
      //   one per member      — a member's second report on the same Page does
      //                         not re-hide, which kills the restore →
      //                         re-report → hidden-again loop.
      //   a restore is sticky — locked while photo_hide_locked_url = photo_url.
      //                         Replacing the photo un-locks it on its own, so
      //                         the lock cannot outlive the photo it was
      //                         granted for. Nothing here clears it.
      //   the open-report cap — decouples the hide from an unbounded reporter.
      const isLocked =
        subject.photo_hide_locked_url !== null &&
        subject.photo_hide_locked_url === subject.photo_url

      // F078 criterion 8 — sensitive content and threat of harm hide whatever
      // the per-member limits say. The restore lock still holds: Don has
      // already looked at that photo.
      const urgent = URGENT_CATEGORIES.includes(input.category)
      if (urgent && !subject.reporter_is_builder && !subject.builder_on_real) textAfterCommit = true

      // F078 criteria 6–8. No classifier yet, so no report carries a score: above
      // a bar of 0 a report is below it and only queues. Urgent categories hide
      // at any bar.
      const reachesBar = Number(subject.hide_bar) === 0

      const shouldHide =
        !subject.builder_on_real &&
        subject.photo_url !== null &&
        subject.photo_hidden_at === null &&
        !isLocked &&
        (urgent || (reachesBar && priorBySameMember === 0 && openByReporter < MAX_OPEN_REPORTS_PER_REPORTER))

      if (!shouldHide) {
        return { reportId, photoHidden: false }
      }

      // `photo_hidden_at is null` in the WHERE re-asserts the read above, so a
      // concurrent report cannot produce two hides and two events.
      const hideRes = await client.query<{ id: string }>(
        `update public.groups
            set photo_hidden_at = $2
          where id = $1
            and photo_hidden_at is null
          returning id`,
        [input.subjectId, ctx.now()],
      )
      if (hideRes.rows.length === 0) {
        return { reportId, photoHidden: false }
      }

      await appendEvent(txCtx, 'group_events', {
        group_id: input.subjectId,
        event_kind: 'group.photo_hidden',
        payload: { report_id: reportId, reason: 'reported' },
      })

      // F078 criterion 3 — the poster is told, in-app, the reporter's chosen
      // reason. Sensitive content stays operator-only until the NCMEC plan is
      // settled (ruled 2026-10-07): a child's picture never goes back to the poster.
      if (input.category !== 'sensitive_content' && !subject.reporter_is_builder) {
        await client.query(
          `insert into public.member_notices
             (member_id, kind, report_id, subject_kind, subject_id, category, message, created_at)
           values ($1, 'content_hidden', $2, $3, $4, $5, $6, $7)`,
          [
            subject.founder_member_id,
            reportId,
            input.subjectKind,
            input.subjectId,
            input.category,
            hiddenNoticeMessage(subject.name, input.category),
            ctx.now(),
          ],
        )
      }

      return { reportId, photoHidden: true }
    })

    // After the commit, so a text never announces a report that rolled back.
    // Names the reason and where to look; never the reporter or what they wrote.
    if (textAfterCommit) {
      const site = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.socialus.org'
      await textOperator(
        `SocialUs: a "${categoryLabel(input.category)}" report came in${result.photoHidden ? ' and hid a Page photo' : ''}. Review: ${site}/admin/reports`,
      )
    }
    return result
  },
)
