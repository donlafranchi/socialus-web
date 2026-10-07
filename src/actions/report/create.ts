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
import { assessAfterReport } from '@/lib/moderation/after-report'
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

// F102 criteria 6–7 and F078 criterion 10: counters on the act of reporting,
// never a score on the person. A report the operator dismissed (approved the
// content it was about) tightens what that reporter's later reports may hide.
const DAY_MS = 86_400_000
const CAP_AFTER_A_DISMISSAL = 1
const COOL_DOWN_DAYS = 14
const STRIKES_BEFORE_NO_HIDING = 3

/** The latest decision on each of this reporter's reports, when it dismissed it. */
async function dismissalTimes(client: Queryable, reporterId: string): Promise<Date[]> {
  const res = await client.query<{ decided_at: Date }>(
    `select x.decided_at
       from (select distinct on (d.report_id) d.outcome, d.decided_at
               from public.report_decisions d
               join public.reports r on r.id = d.report_id
              where r.reporter_member_id = $1
              order by d.report_id, d.decided_at desc) x
      where x.outcome = 'restored'
      order by x.decided_at desc`,
    [reporterId],
  )
  return res.rows.map((r) => new Date(r.decided_at))
}

function hideCapFor(dismissed: Date[], now: Date): { cap: number; hidesAnything: boolean } {
  const recent = dismissed.filter((d) => now.getTime() - d.getTime() <= 30 * DAY_MS)
  const struckOut = dismissed.length >= STRIKES_BEFORE_NO_HIDING
  // Two dismissed in 30 days start a cool-down that runs 14 days from the latest.
  const coolingDown = recent.length >= 2 && now.getTime() - recent[0]!.getTime() < COOL_DOWN_DAYS * DAY_MS
  return {
    cap: recent.length > 0 ? CAP_AFTER_A_DISMISSAL : MAX_OPEN_REPORTS_PER_REPORTER,
    hidesAnything: !struckOut && !coolingDown,
  }
}
const MAX_REPORTS_PER_SUBJECT = 2

export const reportCreateInput = z.object({
  // What is reported: the Page's photo ('group', the original subject), a Post
  // body ('post'), the Page picture, or one post's photo (F099 criterion 8: each
  // image reportable on its own, and a report hides that one image only). Items
  // never join (model.md § There are no Items).
  subjectKind: z.enum(['group', 'post', 'page_picture', 'post_photo']),
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

interface Subject {
  groupId: string
  founderId: string
  pageName: string
  hideBar: string | number
  builderOnReal: boolean
  reporterIsBuilder: boolean
  /** Something there to hide: a Page with a photo, any Post. */
  hideable: boolean
  alreadyHidden: boolean
  /** A restore is sticky for what was reviewed. */
  locked: boolean
  hiddenEventKind: 'group.photo_hidden' | 'group.post_hidden'
  /** False when a concurrent report got there first. */
  hide: (client: Queryable, now: Date) => Promise<boolean>
}

type Queryable = { query: <T>(sql: string, params: unknown[]) => Promise<{ rows: T[] }> }

// F078 criterion 7: the metro's bar, 0 when the metro cannot be resolved.
// min() so an overlap leans toward hiding.
const BAR_OF_LOCATION = `coalesce((select min(mp.hide_bar)
                            from public.locations l
                            join public.metro_polygons mp on st_intersects(l.geography, mp.geography)
                           where l.id = %LOCATION%), 0)`

/** What the subject's `update` is called for: one image on a Page or a post. */
function imageSubject(
  r: {
    group_id: string
    photo_url: string | null
    photo_hidden_at: Date | null
    photo_hide_locked_url: string | null
    builder_on_real: boolean
    reporter_is_builder: boolean
    founder_member_id: string
    name: string
    hide_bar: string | number
  },
  hide: Subject['hide'],
): Subject {
  return {
    groupId: r.group_id,
    founderId: r.founder_member_id,
    pageName: r.name,
    hideBar: r.hide_bar,
    builderOnReal: r.builder_on_real,
    reporterIsBuilder: r.reporter_is_builder,
    hideable: r.photo_url !== null,
    alreadyHidden: r.photo_hidden_at !== null,
    // Locked while the hide-locked url = the image's url; replacing the image
    // un-locks it on its own.
    locked: r.photo_hide_locked_url !== null && r.photo_hide_locked_url === r.photo_url,
    hiddenEventKind: 'group.photo_hidden',
    hide,
  }
}

type ImageRow = Parameters<typeof imageSubject>[0]

async function loadSubject(
  client: Queryable,
  kind: ReportCreateInput['subjectKind'],
  id: string,
  reporterId: string,
): Promise<Subject | null> {
  // One query per kind, each written out in full: the table and the columns
  // differ, and a name built from input is how an injection gets in. #280 — a
  // builder's report on a real Page is stored and queued, and never hides
  // anything a real member sees.
  if (kind === 'group' || kind === 'page_picture') {
    const picture = kind === 'page_picture'
    const res = await client.query<ImageRow>(
      picture
        ? `select id as group_id, picture_url as photo_url, picture_hidden_at as photo_hidden_at,
                  picture_hide_locked_url as photo_hide_locked_url,
                  public.is_builder($2) and not public.is_builder(founder_member_id) as builder_on_real,
                  public.is_builder($2) as reporter_is_builder,
                  founder_member_id, name,
                  ${BAR_OF_LOCATION.replace('%LOCATION%', 'groups.anchor_location_id')} as hide_bar
             from public.groups
            where id = $1`
        : `select id as group_id, photo_url, photo_hidden_at, photo_hide_locked_url,
                  public.is_builder($2) and not public.is_builder(founder_member_id) as builder_on_real,
                  public.is_builder($2) as reporter_is_builder,
                  founder_member_id, name,
                  ${BAR_OF_LOCATION.replace('%LOCATION%', 'groups.anchor_location_id')} as hide_bar
             from public.groups
            where id = $1`,
      [id, reporterId],
    )
    const g = res.rows[0]
    if (!g) return null
    return imageSubject(g, async (c, now) => {
      const r = await c.query<{ id: string }>(
        picture
          ? `update public.groups set picture_hidden_at = $2 where id = $1 and picture_hidden_at is null returning id`
          : `update public.groups set photo_hidden_at = $2 where id = $1 and photo_hidden_at is null returning id`,
        [id, now],
      )
      return r.rows.length > 0
    })
  }

  if (kind === 'post_photo') {
    const res = await client.query<ImageRow>(
      `select g.id as group_id, pp.photo_url, pp.photo_hidden_at, pp.photo_hide_locked_url,
              public.is_builder($2) and not public.is_builder(g.founder_member_id) as builder_on_real,
              public.is_builder($2) as reporter_is_builder,
              g.founder_member_id, g.name,
              ${BAR_OF_LOCATION.replace('%LOCATION%', 'coalesce(pp.location_id, g.anchor_location_id)')} as hide_bar
         from public.page_posts pp
         join public.groups g on g.id = pp.group_id
        where pp.id = $1 and pp.dissolved_at is null`,
      [id, reporterId],
    )
    const p = res.rows[0]
    if (!p) return null
    return imageSubject(p, async (c, now) => {
      const r = await c.query<{ id: string }>(
        `update public.page_posts set photo_hidden_at = $2 where id = $1 and photo_hidden_at is null returning id`,
        [id, now],
      )
      return r.rows.length > 0
    })
  }

  const res = await client.query<{
    group_id: string
    body: string
    hidden_at: Date | null
    hide_locked_body: string | null
    builder_on_real: boolean
    reporter_is_builder: boolean
    founder_member_id: string
    name: string
    hide_bar: string | number
  }>(
    `select p.group_id, p.body, p.hidden_at, p.hide_locked_body,
            public.is_builder($2) and not public.is_builder(g.founder_member_id) as builder_on_real,
            public.is_builder($2) as reporter_is_builder,
            g.founder_member_id, g.name,
            ${BAR_OF_LOCATION.replace('%LOCATION%', 'coalesce(p.location_id, g.anchor_location_id)')} as hide_bar
       from public.page_posts p
       join public.groups g on g.id = p.group_id
      where p.id = $1 and p.dissolved_at is null`,
    [id, reporterId],
  )
  const p = res.rows[0]
  if (!p) return null
  return {
    groupId: p.group_id,
    founderId: p.founder_member_id,
    pageName: p.name,
    hideBar: p.hide_bar,
    builderOnReal: p.builder_on_real,
    reporterIsBuilder: p.reporter_is_builder,
    hideable: true,
    alreadyHidden: p.hidden_at !== null,
    locked: p.hide_locked_body !== null && p.hide_locked_body === p.body,
    hiddenEventKind: 'group.post_hidden',
    // Hidden means private (managers only): every read path already honours it.
    hide: async (c, now) => {
      const r = await c.query<{ id: string }>(
        `update public.page_posts
            set hidden_at = $2, hidden_prior_discoverability = discoverability, discoverability = 'private'
          where id = $1 and hidden_at is null
          returning id`,
        [id, now],
      )
      return r.rows.length > 0
    },
  }
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
      // design. The handler is what keeps it honest.
      const subject = await loadSubject(client, input.subjectKind, input.subjectId, reporterMemberId)
      if (!subject) {
        throw new NotFoundError(`report.create: ${input.subjectKind} ${input.subjectId} not found`)
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
      const limits = hideCapFor(await dismissalTimes(client, reporterMemberId), ctx.now())

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
        group_id: subject.groupId,
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
      // F078 criterion 8 — sensitive content and threat of harm hide whatever
      // the per-member limits say. The restore lock still holds: Don has
      // already looked at that photo.
      const urgent = URGENT_CATEGORIES.includes(input.category)
      if (urgent && !subject.reporterIsBuilder && !subject.builderOnReal) textAfterCommit = true

      // F078 criteria 6–8. No classifier yet, so no report carries a score: above
      // a bar of 0 a report is below it and only queues. Urgent categories hide
      // at any bar.
      const reachesBar = Number(subject.hideBar) === 0

      const shouldHide =
        !subject.builderOnReal &&
        subject.hideable &&
        !subject.alreadyHidden &&
        !subject.locked &&
        // [open-question owner=don raised=2026-10-07] F102 criterion 7 says a cool-down hides
        // nothing; F078 criterion 8 says sensitive content and threat of harm hide whatever
        // the bar. Built to the cautious reading: those two still hide from a reporter with
        // a record (and still text the operator). Which is meant?
        (urgent || (limits.hidesAnything && reachesBar && priorBySameMember === 0 && openByReporter < limits.cap))

      if (!shouldHide) {
        return { reportId, photoHidden: false }
      }

      // The WHERE re-asserts the read above, so a concurrent report cannot
      // produce two hides and two events.
      if (!(await subject.hide(client, ctx.now()))) {
        return { reportId, photoHidden: false }
      }

      await appendEvent(txCtx, 'group_events', {
        group_id: subject.groupId,
        event_kind: subject.hiddenEventKind,
        payload: { report_id: reportId, reason: 'reported', subject_kind: input.subjectKind },
      })

      // F078 criterion 3 — the poster is told, in-app, the reporter's chosen
      // reason. Sensitive content stays operator-only until the NCMEC plan is
      // settled (ruled 2026-10-07): a child's picture never goes back to the poster.
      if (input.category !== 'sensitive_content' && !subject.reporterIsBuilder) {
        await client.query(
          `insert into public.member_notices
             (member_id, kind, report_id, subject_kind, subject_id, category, message, created_at, page_id)
           values ($1, 'content_hidden', $2, $3, $4, $5, $6, $7, $8)`,
          [
            subject.founderId,
            reportId,
            input.subjectKind,
            input.subjectId,
            input.category,
            hiddenNoticeMessage(subject.pageName, input.category, input.subjectKind),
            ctx.now(),
            subject.groupId,
          ],
        )
      }

      return { reportId, photoHidden: true }
    })

    // F100 — the AI reads it after the response; shadow mode changes nothing.
    assessAfterReport(result.reportId)

    // After the commit, so a text never announces a report that rolled back.
    // Names the reason and where to look; never the reporter or what they wrote.
    if (textAfterCommit) {
      const site = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.socialus.org'
      await textOperator(
        `SocialUs: a "${categoryLabel(input.category)}" report came in${result.photoHidden ? (input.subjectKind === 'post' ? ' and hid a Post' : ' and hid a Page photo') : ''}. Review: ${site}/admin/reports`,
      )
    }
    return result
  },
)
