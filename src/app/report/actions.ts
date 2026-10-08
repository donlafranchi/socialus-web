'use server'

// #443 — "Report a problem". Signed-in members only. The whole report goes to the
// private table through `problem.report`; the scrubbed public Issue is made later.

import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase-server'
import { resolveActionContext } from '@/lib/action-context'
import { problemReport } from '@/actions'

export type ReportProblemResult = { ok: true } | { ok: false; message: string }

export async function reportProblemAction(input: { description: string; route: string; website?: string }): Promise<ReportProblemResult> {
  // A hidden field only a bot fills in: told thanks, nothing written.
  if (input.website) return { ok: true }
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  if (!data.user) return { ok: false, message: 'Sign in to send a report.' }
  const ua = (await headers()).get('user-agent') ?? undefined
  try {
    await problemReport(resolveActionContext({ actingMemberId: data.user.id }), {
      description: input.description,
      route: input.route,
      ...(ua ? { userAgent: ua } : {}),
      ...(process.env.VERCEL_GIT_COMMIT_SHA ? { buildSha: process.env.VERCEL_GIT_COMMIT_SHA } : {}),
    })
    return { ok: true }
  } catch {
    // Placeholder copy ([public-is-draft]).
    return { ok: false, message: 'We couldn’t send that. Try again in a while.' }
  }
}
