'use server'

// #301 — Start: a draft of the chosen kind, nothing else, then the draft Page
// in the owner view, where the name, where it is and the description are added.

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import { resolveActionContext } from '@/lib/action-context'
import { groupActivate, groupCreate, ActionError } from '@/actions'
import { canonicalPagePath } from '@/lib/groups/page-handle'

const KINDS = ['business', 'practice', 'interest'] as const

export async function startDraftAction(kind: (typeof KINDS)[number]): Promise<void> {
  if (!(KINDS as readonly string[]).includes(kind)) throw new Error('Choose what you are starting.')
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  if (!data.user) redirect(`/auth/login?next=${encodeURIComponent('/create')}`)

  let groupId: string
  try {
    ;({ groupId } = await groupCreate(resolveActionContext({ actingMemberId: data.user.id }), {
      kind,
      founderMemberId: data.user.id,
    }))
  } catch (err) {
    throw err instanceof ActionError ? new Error(err.message) : err
  }
  // The founder reads their own draft (groups_select_active_or_own_draft).
  const { data: row } = await supabase.from('groups').select('slug, public_id').eq('id', groupId).single()
  const r = row as { slug: string; public_id: string } | null
  if (!r) throw new Error("That didn't go through. Try again?")
  redirect(canonicalPagePath(r.slug, r.public_id))
}

/** #301 — Publish from the draft's checklist. group.activate re-checks the
 *  name, where it is and the description, and that the caller founded it. */
export async function publishDraftAction(groupId: string): Promise<void> {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  if (!data.user) redirect('/auth/login')
  try {
    await groupActivate(resolveActionContext({ actingMemberId: data.user.id }), { groupId })
  } catch (err) {
    throw err instanceof ActionError ? new Error(err.message) : err
  }
  const { data: row } = await supabase.from('groups').select('slug, public_id').eq('id', groupId).single()
  const r = row as { slug: string; public_id: string } | null
  redirect(r ? canonicalPagePath(r.slug, r.public_id) : '/you')
}
