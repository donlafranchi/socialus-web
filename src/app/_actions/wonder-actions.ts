'use server'

// F117 — I'm in, leave, offer to help, take an offer back, and the poster's accept or decline.
// Failures come back as data, never as a throw (#107); a refusal the member can fix keeps its message.

import { createClient } from '@/lib/supabase-server'
import { resolveActionContext } from '@/lib/action-context'
import { wonderJoin, wonderLeave, wonderOffer, wonderOfferWithdraw, wonderOfferDecide, ValidationError } from '@/actions'
import type { WonderRole } from '@/lib/wonders/roles'

async function memberId(): Promise<string | null> {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getUser()
  return error || !data.user ? null : data.user.id
}

async function run<T extends object>(fn: (id: string) => Promise<T>): Promise<({ ok: true } & T) | { ok: false; message?: string }> {
  const id = await memberId()
  if (!id) return { ok: false }
  try {
    return { ok: true, ...(await fn(id)) }
  } catch (err) {
    if (err instanceof ValidationError) return { ok: false, message: err.message }
    console.error('[wonders] action failed:', err instanceof Error ? err.message : err)
    return { ok: false }
  }
}

const ctx = (id: string) => resolveActionContext({ actingMemberId: id })

export async function wonderJoinAction(input: { postId: string; option: string | null }) {
  return run((id) => wonderJoin(ctx(id), input))
}

export async function wonderLeaveAction(input: { postId: string }) {
  return run((id) => wonderLeave(ctx(id), input))
}

export async function wonderOfferAction(input: { postId: string; roles: WonderRole[]; note: string | null }) {
  return run((id) => wonderOffer(ctx(id), input))
}

export async function wonderOfferWithdrawAction(input: { offerId: string }) {
  return run((id) => wonderOfferWithdraw(ctx(id), input))
}

export async function wonderOfferDecideAction(input: { offerId: string; decision: 'accepted' | 'declined' }) {
  return run((id) => wonderOfferDecide(ctx(id), input))
}
