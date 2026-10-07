'use server'

// #423 — archive, delete and restore a Page. Authorization is in the handlers
// (the managing role); this resolves who is calling and hands off. Failures
// are returned, not thrown: Next redacts a thrown message in production (#231).

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase-server'
import { resolveActionContext } from '@/lib/action-context'
import { groupArchive, groupDelete, groupRestore, ActionError } from '@/actions'

export type PageLifecycleResult = { ok: true } | { ok: false; message: string }

// Copy is a placeholder ([public-is-draft]).
const DIDNT_GO_THROUGH = "That didn't go through. Mind trying again?"

async function run(fn: (memberId: string) => Promise<unknown>, paths: string[]): Promise<PageLifecycleResult> {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) return { ok: false, message: 'You must be signed in.' }
  try {
    await fn(data.user.id)
  } catch (err) {
    if (!(err instanceof ActionError)) console.error('page lifecycle action failed', err)
    return { ok: false, message: DIDNT_GO_THROUGH }
  }
  for (const p of paths) revalidatePath(p)
  return { ok: true }
}

export async function archivePageAction(input: { groupId: string; pagePath: string }): Promise<PageLifecycleResult> {
  return run((id) => groupArchive(resolveActionContext({ actingMemberId: id }), { groupId: input.groupId }), [input.pagePath, '/you'])
}

export async function deletePageAction(input: { groupId: string; pagePath: string; confirmName: string }): Promise<PageLifecycleResult> {
  return run(
    (id) => groupDelete(resolveActionContext({ actingMemberId: id }), { groupId: input.groupId, confirmName: input.confirmName }),
    [input.pagePath, '/you'],
  )
}

export async function restorePageAction(input: { groupId: string }): Promise<PageLifecycleResult> {
  return run((id) => groupRestore(resolveActionContext({ actingMemberId: id }), { groupId: input.groupId }), ['/you'])
}
