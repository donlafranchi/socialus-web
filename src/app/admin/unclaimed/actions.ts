'use server'

// #353 — Restore a hidden unclaimed Page. Authorization is in the handler.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase-server'
import { resolveActionContext } from '@/lib/action-context'
import { groupUnclaimedRestore } from '@/actions/group'
import { ActionError } from '@/actions/_lib/errors'

export async function restoreUnclaimedAction(groupId: string): Promise<void> {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) throw new Error('Not permitted.')
  try {
    await groupUnclaimedRestore(resolveActionContext({ actingMemberId: data.user.id }), { groupId })
  } catch (err) {
    throw err instanceof ActionError ? new Error(err.message) : err
  }
  revalidatePath('/admin/unclaimed')
}
