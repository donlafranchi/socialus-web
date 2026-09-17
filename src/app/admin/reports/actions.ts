'use server'

// The operator surface's two server actions.
//
// Authorization is NOT here — it is in the handlers. This resolves who is
// calling and hands off; `report.restore` / `report.remove` refuse a
// non-operator on their own, so a direct POST is as dead as a hidden button.
//
// THE STORAGE OBJECT IS NOT DELETED HERE, and that is a known gap rather than
// an oversight. F058 criterion 4 asks for it. The bucket's delete policy is
// "media authenticated delete own folder" (migration 039) — a member may delete
// their own folder and nobody else's. The operator is not the owner of the
// reported member's folder, so the authenticated key cannot remove the object,
// and the service-role key is forbidden by the action-layer conformance rules.
//
// What removal DOES do is null `photo_url`, which takes the photo out of every
// read path in the product at once. The residue is an orphaned object still
// reachable by someone who already holds that exact URL. Closing it needs a
// storage policy for the operator — a migration, which needs a production apply
// only Don runs, and folding that in would block this on him. Flagged on the
// PR; the takedown itself does not wait for it.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase-server'
import { resolveActionContext } from '@/lib/action-context'
import { reportRestore, reportRemove, ActionError } from '@/actions'

async function context() {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) throw new Error('Not permitted.')
  return resolveActionContext({ actingMemberId: data.user.id })
}

export async function restoreReportAction(reportId: string): Promise<void> {
  const ctx = await context()
  try {
    await reportRestore(ctx, { reportId })
  } catch (err) {
    throw err instanceof ActionError ? new Error(err.message) : err
  }
  revalidatePath('/admin/reports')
}

export async function removeReportAction(reportId: string): Promise<void> {
  const ctx = await context()
  try {
    await reportRemove(ctx, { reportId })
  } catch (err) {
    throw err instanceof ActionError ? new Error(err.message) : err
  }
  revalidatePath('/admin/reports')
}
