'use server'

// #1171 — ♡ and Save. Failures come back as data, never as a throw; signedOut tells the button to ask for sign-in.

import { createClient } from '@/lib/supabase-server'
import { viewerId } from '@/lib/auth/viewer'
import { resolveActionContext } from '@/lib/action-context'
import { memberHeartSet, memberSaveSet, type MemberHeartSetInput } from '@/actions'

type Result = { ok: true; on: boolean } | { ok: false; signedOut?: true }

async function run(fn: (id: string) => Promise<{ on: boolean }>): Promise<Result> {
  // #1269 — who taps, from the verified token (as #791 does for reads), not a round trip to the auth server:
  // under a burst of taps that round trip failed and answered "signed out" to signed-in members.
  const memberId = await viewerId(await createClient())
  if (!memberId) return { ok: false, signedOut: true }
  try {
    return { ok: true, ...(await fn(memberId)) }
  } catch (err) {
    console.error('[hearts-saves] action failed:', err instanceof Error ? err.message : err)
    return { ok: false }
  }
}

export async function setHeartAction(input: MemberHeartSetInput): Promise<Result> {
  return run((id) => memberHeartSet(resolveActionContext({ actingMemberId: id }), input))
}

export async function setSaveAction(input: { postId: string; on: boolean }): Promise<Result> {
  return run((id) => memberSaveSet(resolveActionContext({ actingMemberId: id }), input))
}
