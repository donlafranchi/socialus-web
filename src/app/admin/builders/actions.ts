'use server'

// #388 — the builder-content page's writes. Authorization is in the handlers.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase-server'
import { resolveActionContext } from '@/lib/action-context'
import { builderContentSetVisible, builderContentDeleteAll, type BuilderContentDeleted } from '@/actions/builder'
import { ActionError } from '@/actions/_lib/errors'

async function context() {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) throw new Error('Not permitted.')
  return resolveActionContext({ actingMemberId: data.user.id })
}

async function run<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (err) {
    throw err instanceof ActionError ? new Error(err.message) : err
  } finally {
    revalidatePath('/admin/builders')
  }
}

export async function setBuilderContentVisibleAction(visible: boolean): Promise<void> {
  const ctx = await context()
  await run(() => builderContentSetVisible(ctx, { visible }))
}

export async function deleteAllBuilderContentAction(): Promise<BuilderContentDeleted> {
  const ctx = await context()
  return run(() => builderContentDeleteAll(ctx, { confirm: 'DELETE' }))
}
