'use server'

// The operator surface's server actions.
//
// Authorization is NOT here — it is in the handlers. This resolves who is
// calling and hands off; `report.decide` / `report.reverse` refuse a
// non-operator on their own, so a direct POST is as dead as a hidden button.
//
// NOTHING IS DELETED, in either direction. Removal sets `photo_removed_at` and
// leaves `photo_url` and the storage object intact, which is what makes every
// decision reversible. The bytes staying fetchable by direct URL is the known
// cost of that; docs/purge-proposal.md specifies the irreversible path that
// closes it, and it is deliberately not built.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase-server'
import { resolveActionContext } from '@/lib/action-context'
import { reportDecide, reportReverse, ActionError } from '@/actions'
import type { ReasonCode } from '@/lib/admin/reason-codes'

async function context() {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) throw new Error('Not permitted.')
  return resolveActionContext({ actingMemberId: data.user.id })
}

function rethrow(err: unknown): never {
  throw err instanceof ActionError ? new Error(err.message) : err
}

export async function decideReportAction(input: {
  reportId: string
  outcome: 'restored' | 'removed'
  reasonCode: ReasonCode
  reasonNote?: string
}): Promise<void> {
  const ctx = await context()
  try {
    await reportDecide(ctx, input)
  } catch (err) {
    rethrow(err)
  }
  revalidatePath('/admin/reports')
}

export async function reverseDecisionAction(input: {
  decisionId: string
  reasonCode: ReasonCode
  reasonNote?: string
}): Promise<void> {
  const ctx = await context()
  try {
    await reportReverse(ctx, input)
  } catch (err) {
    rethrow(err)
  }
  revalidatePath('/admin/reports')
}
