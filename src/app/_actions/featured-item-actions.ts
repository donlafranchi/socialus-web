'use server'

// #909 — server actions behind a Page's featured products and services. Failures come back as data (#107).

import { createClient } from '@/lib/supabase-server'
import { resolveActionContext } from '@/lib/action-context'
import { featuredItemSave, featuredItemRemove, ActionError } from '@/actions'
import { succeeded, failed, type ActionResult } from '@/app/you/sell/action-result'
import type { FeaturedSaveInput } from '@/components/group/FeaturedItems'

async function currentMemberId(): Promise<string | null> {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getUser()
  return error || !data.user ? null : data.user.id
}

const asFailure = <T>(err: unknown): ActionResult<T> =>
  err instanceof ActionError ? failed(err.message, err.code) : failed("That didn't save. Mind trying again?", 'unknown')

export async function saveFeaturedItemAction(input: FeaturedSaveInput): Promise<ActionResult<{ itemId: string }>> {
  const memberId = await currentMemberId()
  if (!memberId) return failed('Sign in first.', 'authorization')
  try {
    return succeeded(await featuredItemSave(resolveActionContext({ actingMemberId: memberId }), input))
  } catch (err) {
    return asFailure(err)
  }
}

export async function removeFeaturedItemAction(input: { groupId: string; itemId: string }): Promise<ActionResult<{ itemId: string }>> {
  const memberId = await currentMemberId()
  if (!memberId) return failed('Sign in first.', 'authorization')
  try {
    return succeeded(await featuredItemRemove(resolveActionContext({ actingMemberId: memberId }), input))
  } catch (err) {
    return asFailure(err)
  }
}
