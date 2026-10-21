'use server'

// #987 — claim an unclaimed Page, signed in. The code goes from the handler straight to the business's
// own address or phone; the browser only ever sees where it went.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase-server'
import { resolveActionContext } from '@/lib/action-context'
import { getPool } from '@/actions/_lib/db'
import { groupClaimStart, groupClaimVerify, groupClaimProof, CLAIM_REFUSED } from '@/actions/group'
import { ActionError, ConflictError } from '@/actions/_lib/errors'
import { claimOptions, maskPhone, phoneClaimsEnabled } from '@/lib/claims/verify'
import { sendClaimCode } from '@/lib/claims/deliver'

export type ClaimFailure = 'signed_out' | 'taken' | 'limit' | 'wrong_code' | 'expired' | 'failed'
export type ClaimResult<T = object> = ({ ok: true } & T) | { ok: false; reason: ClaimFailure }

export interface ClaimChoices {
  emailDomain: string | null
  phone: string | null
  proof: boolean
}

async function memberId(): Promise<string | null> {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  return data.user?.id ?? null
}

function reasonOf(err: unknown): ClaimFailure {
  if (!(err instanceof ActionError)) throw err
  if (err.message === CLAIM_REFUSED.claimed) return 'taken'
  if (err instanceof ConflictError) return 'limit'
  if (err.message === CLAIM_REFUSED.wrongCode) return 'wrong_code'
  if (err.message === CLAIM_REFUSED.expired) return 'expired'
  return 'failed'
}

/** What this Page can be claimed with. The phone is shown masked; the address is never shown. */
export async function claimChoicesAction(groupId: string): Promise<ClaimChoices | null> {
  const { rows } = await getPool().query<{ public_info_url: string | null; contact_phone: string | null }>(
    `select public_info_url, contact_phone from public.groups where id = $1 and unclaimed_at is not null and unclaimed_hidden_at is null`,
    [groupId],
  )
  if (!rows[0]) return null
  const o = claimOptions({ publicInfoUrl: rows[0].public_info_url, contactPhone: rows[0].contact_phone, phoneEnabled: phoneClaimsEnabled() })
  return { emailDomain: o.emailDomain, phone: o.phone ? maskPhone(o.phone) : null, proof: o.proof }
}

export async function startClaimAction(input: { groupId: string; method: 'email' | 'phone'; email?: string }): Promise<ClaimResult<{ claimId: string; sentTo: string }>> {
  const me = await memberId()
  if (!me) return { ok: false, reason: 'signed_out' }
  try {
    const started = await groupClaimStart(resolveActionContext({ actingMemberId: me }), input)
    if (!(await sendClaimCode(started))) return { ok: false, reason: 'failed' }
    return { ok: true, claimId: started.claimId, sentTo: started.method === 'phone' ? maskPhone(started.target) : started.target }
  } catch (err) {
    return { ok: false, reason: reasonOf(err) }
  }
}

export async function verifyClaimAction(input: { claimId: string; code: string; pagePath: string }): Promise<ClaimResult> {
  const me = await memberId()
  if (!me) return { ok: false, reason: 'signed_out' }
  try {
    await groupClaimVerify(resolveActionContext({ actingMemberId: me }), { claimId: input.claimId, code: input.code })
  } catch (err) {
    return { ok: false, reason: reasonOf(err) }
  }
  revalidatePath(input.pagePath)
  return { ok: true }
}

export async function proofClaimAction(input: { groupId: string; proofUrl: string; note?: string }): Promise<ClaimResult> {
  const me = await memberId()
  if (!me) return { ok: false, reason: 'signed_out' }
  try {
    await groupClaimProof(resolveActionContext({ actingMemberId: me }), input)
    return { ok: true }
  } catch (err) {
    return { ok: false, reason: reasonOf(err) }
  }
}
