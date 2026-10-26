'use server'

// T160 (Issue #62) — server action wrapping report.create.
//
// Same shape as group-membership-actions.ts: createClient → getUser →
// resolveActionContext → handler → catch ActionError. Anon callers throw; the
// component gates on `loggedIn` and sends them to sign-in before it gets here.
//
// The return is `{ ok: true }` and nothing else, on purpose. `report.create`
// also returns `photoHidden`, and handing that to the browser would tell a
// reporter that a Page is already reported, already locked, or that they have
// hit their own open-report cap. F058 acceptance 2 is that a report changes
// nothing visible to anyone.

import { createClient } from '@/lib/supabase-server'
import { resolveActionContext } from '@/lib/action-context'
import { reportCreate, reportAnswer, ActionError } from '@/actions'
import { REPORT_REFUSED } from '@/actions/report/create'
import { assessAfterReport } from '@/lib/moderation/after-report'
import type { ReportCategory } from '@/lib/reports/categories'

async function requireMemberId(): Promise<string> {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) throw new Error('You must be signed in.')
  return data.user.id
}

type SendReportResult = { ok: true } | { ok: false; message: string }

const PLAIN: Record<string, string> = {
  [REPORT_REFUSED.alreadyReported]: "You've already reported this one. We have it.",
  [REPORT_REFUSED.tooManyOpen]: "You have a lot of reports open right now. We'll get to them before taking more.",
}

export async function sendReportAction(input: {
  /** The Page's photo when omitted; F099 — or one of the other images. */
  subjectKind?: 'group' | 'post' | 'page_picture' | 'post_photo' | 'page_words' | 'page_item'
  subjectId: string
  category: ReportCategory
  body: string
}): Promise<SendReportResult> {
  const memberId = await requireMemberId()
  const ctx = resolveActionContext({ actingMemberId: memberId })
  try {
    await reportCreate(ctx, {
      subjectKind: input.subjectKind ?? 'group',
      category: input.category,
      subjectId: input.subjectId,
      body: input.body,
    })
    return { ok: true }
  } catch (err) {
    // A returned message, not a thrown one: production redacts what a server action throws,
    // and a member should only ever read plain words, never "report.create: …" (#703).
    return { ok: false, message: (err instanceof ActionError && PLAIN[err.message]) || "That didn't go through. Mind trying again?" }
  }
}

/** F078 criterion 1 — the same report, about a Post. */
export async function sendPostReportAction(input: {
  subjectId: string
  category: ReportCategory
  body: string
}): Promise<SendReportResult> {
  return sendReportAction({ ...input, subjectKind: 'post' })
}

/** F102 and #626 — the owner's one answer to a notice: "This is a mistake". */
export async function answerNoticeAction(input: { noticeId: string }): Promise<void> {
  const memberId = await requireMemberId()
  try {
    const r = await reportAnswer(resolveActionContext({ actingMemberId: memberId }), input)
    // F100 criterion 1 — the claim is read too, in shadow.
    if (r.reportId) assessAfterReport(r.reportId, { rebuttal: 'The owner says this is a mistake.' })
  } catch (err) {
    if (err instanceof ActionError) throw new Error(err.message)
    throw err
  }
}
