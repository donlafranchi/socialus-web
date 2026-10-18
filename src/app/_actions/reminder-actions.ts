'use server'

// #945 — Remind me: set, remove, and every time for a Page that repeats. Failures come back as data, never as a throw.

import { createClient } from '@/lib/supabase-server'
import { resolveActionContext } from '@/lib/action-context'
import { memberReminderSet, memberReminderRemove, memberReminderEveryForPage } from '@/actions'

async function memberId(): Promise<string | null> {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getUser()
  return error || !data.user ? null : data.user.id
}

async function run<T extends object>(fn: (id: string) => Promise<T>): Promise<({ ok: true } & T) | { ok: false }> {
  const id = await memberId()
  if (!id) return { ok: false }
  try {
    return { ok: true, ...(await fn(id)) }
  } catch (err) {
    console.error('[reminders] action failed:', err instanceof Error ? err.message : err)
    return { ok: false }
  }
}

export async function setReminderAction(input: { postId: string; every: boolean }) {
  return run((id) => memberReminderSet(resolveActionContext({ actingMemberId: id }), input))
}

export async function removeReminderAction(reminderId: string) {
  return run((id) => memberReminderRemove(resolveActionContext({ actingMemberId: id }), { reminderId }))
}

export async function remindEveryTimeForPageAction(groupId: string) {
  return run((id) => memberReminderEveryForPage(resolveActionContext({ actingMemberId: id }), { groupId }))
}
