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
import type { ReportCategory } from '@/lib/reports/categories'

async function requireMemberId(): Promise<string> {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) throw new Error('You must be signed in.')
  return data.user.id
}

export async function sendReportAction(input: {
  subjectKind?: 'group' | 'post'
  subjectId: string
  category: ReportCategory
  body: string
}): Promise<{ ok: true }> {
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
    if (err instanceof ActionError) throw new Error(err.message)
    throw err
  }
}

/** F078 criterion 1 — the same report, about a Post. */
export async function sendPostReportAction(input: {
  subjectId: string
  category: ReportCategory
  body: string
}): Promise<{ ok: true }> {
  return sendReportAction({ ...input, subjectKind: 'post' })
}

/** F102 — the poster's one answer to a hide: the report was mistaken, malicious or misuse. */
export async function answerNoticeAction(input: {
  noticeId: string
  reason: 'mistaken' | 'malicious' | 'misusing_reports'
  note: string
}): Promise<void> {
  const memberId = await requireMemberId()
  try {
    await reportAnswer(resolveActionContext({ actingMemberId: memberId }), input)
  } catch (err) {
    if (err instanceof ActionError) throw new Error(err.message)
    throw err
  }
}
