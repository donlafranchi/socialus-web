// #987 — an unclaimed Page is claimed self-serve (2026-10-21: build the system, then get out of the way;
// well-worn: Google Business Profile, Yelp). A signed-in claimant gets a code at an address on the business's
// own website domain, or at the Page's listed phone; the right code makes them the owner at once, with no
// staff step. A Page with neither takes a claim with proof, which an operator decides: the only staff case.
// The first verified claim wins; anyone after it is told to report the Page (the dispute path).
//
// Every step is written to page_claim_events (operator-only). The code is returned to the server action that
// delivers it, never to the browser, and only its hash is stored.

import { z } from 'zod'
import type { PoolClient } from 'pg'
import { defineHandler } from '../_lib/handler'
import { AuthorizationError, ConflictError, NotFoundError, ValidationError } from '../_lib/errors'
import { withTransaction } from '../_lib/db'
import { appendEvent } from '../_lib/event-log'
import { requirePermission } from '../_lib/staff'
import type { ActionContext } from '../_lib/context'
import { CLAIM_LIMITS, claimOptions, emailAtDomain, hashCode, newCode, phoneClaimsEnabled } from '@/lib/claims/verify'

type Client = PoolClient

export const CLAIM_REFUSED = {
  claimed: 'group.claim: this Page is already claimed',
  limit: 'group.claim: too many claims today',
  wrongCode: 'group.claim: that code is not right',
  expired: 'group.claim: that code has expired',
} as const

interface ClaimablePage {
  name: string
  public_info_url: string | null
  contact_phone: string | null
  unclaimed_at: Date | null
  unclaimed_hidden_at: Date | null
}

async function lockPage(client: Client, groupId: string, verb: string): Promise<ClaimablePage> {
  const res = await client.query<ClaimablePage>(
    `select name, public_info_url, contact_phone, unclaimed_at, unclaimed_hidden_at from public.groups
      where id = $1 and lifecycle_state <> 'dissolved' for update`,
    [groupId],
  )
  const page = res.rows[0]
  if (!page || page.unclaimed_hidden_at) throw new NotFoundError(`${verb}: no Page ${groupId}`)
  return page
}

async function logEvent(client: Client, claimId: string, groupId: string, kind: string, actor: string | null, payload: object = {}) {
  await client.query(
    `insert into public.page_claim_events (claim_id, group_id, event_kind, acting_member_id, payload) values ($1, $2, $3, $4, $5)`,
    [claimId, groupId, kind, actor, JSON.stringify(payload)],
  )
}

async function requireUnderLimits(client: Client, memberId: string, groupId: string, now: Date) {
  const res = await client.query<{ mine: number; page: number }>(
    `select count(*) filter (where claimant_member_id = $1)::int as mine, count(*) filter (where group_id = $2)::int as page
       from public.page_claims where created_at > $3::timestamptz - interval '1 day' and (claimant_member_id = $1 or group_id = $2)`,
    [memberId, groupId, now],
  )
  const { mine, page } = res.rows[0] ?? { mine: 0, page: 0 }
  if (mine >= CLAIM_LIMITS.startsPerMemberPerDay || page >= CLAIM_LIMITS.startsPerPagePerDay) throw new ConflictError(CLAIM_REFUSED.limit)
}

/** Refuses a Page someone already owns, logging the try against it: that claimant goes to the report path. */
async function requireStillUnclaimed(client: Client, page: ClaimablePage, groupId: string, memberId: string, claimId: string | null) {
  if (page.unclaimed_at) return
  if (claimId) {
    await client.query(`update public.page_claims set status = 'superseded', decided_at = now() where id = $1`, [claimId])
    await logEvent(client, claimId, groupId, 'claim.refused_claimed', memberId)
  }
  throw new ConflictError(CLAIM_REFUSED.claimed)
}

/** The claim completes: the claimant owns the Page, it is no longer unclaimed, and its samples come off. */
async function completeClaim(ctx: ActionContext, client: Client, claim: { id: string; group_id: string; claimant_member_id: string }, now: Date) {
  const { group_id: groupId, claimant_member_id: owner } = claim
  await client.query(
    `update public.groups set unclaimed_at = null, claimed_at = $2, founder_member_id = $3, updated_at = $2 where id = $1`,
    [groupId, now, owner],
  )
  await client.query(
    `insert into public.group_memberships (group_id, member_id, role, source, joined_at, left_at)
     values ($1, $2, 'owner', 'explicit', $3, null)
     on conflict (group_id, member_id) do update set role = 'owner', source = 'explicit', left_at = null`,
    [groupId, owner, now],
  )
  // Sample posts and items give way to the owner (2026-10-21): soft, so the history stays.
  const posts = await client.query(
    `update public.page_posts set dissolved_at = $2, updated_at = $2
      where group_id = $1 and sample_kind is not null and dissolved_at is null returning id`,
    [groupId, now],
  )
  const items = await client.query(
    `update public.items set deleted_at = $2 where group_id = $1 and sample_source_url is not null and deleted_at is null returning id`,
    [groupId, now],
  )
  await client.query(
    `update public.page_claims set status = 'superseded', decided_at = $3
      where group_id = $1 and id <> $2 and status in ('pending', 'review')`,
    [groupId, claim.id, now],
  )
  const ownerCtx: ActionContext = { actingMemberId: owner, viaDelegationId: null, traceId: ctx.traceId, db: client, now: ctx.now }
  await appendEvent(ownerCtx, 'group_events', {
    group_id: groupId,
    event_kind: 'group.claimed',
    payload: { claim_id: claim.id, samples_removed: posts.rows.length + items.rows.length },
  })
  await appendEvent(ownerCtx, 'group_events', {
    group_id: groupId,
    event_kind: 'group.member_joined',
    payload: { member_id: owner, role: 'owner', source: 'explicit' },
  })
}

export const groupClaimStartInput = z.object({
  groupId: z.string().uuid(),
  method: z.enum(['email', 'phone']),
  /** The address at the business's own domain; ignored for phone (the Page's listed number is used). */
  email: z.string().trim().max(320).optional(),
})

export interface ClaimStarted {
  claimId: string
  method: 'email' | 'phone'
  target: string
  pageName: string
  /** For the server action to deliver. Never sent to the browser. */
  code: string
}

export const groupClaimStart = defineHandler(
  'group.claim_start',
  groupClaimStartInput,
  async (ctx: ActionContext, input): Promise<ClaimStarted> => {
    const memberId = ctx.actingMemberId
    return withTransaction(async (client) => {
      const page = await lockPage(client, input.groupId, 'group.claim_start')
      await requireStillUnclaimed(client, page, input.groupId, memberId, null)
      const options = claimOptions({ publicInfoUrl: page.public_info_url, contactPhone: page.contact_phone, phoneEnabled: phoneClaimsEnabled() })
      let target: string
      if (input.method === 'email') {
        if (!options.emailDomain) throw new ValidationError('group.claim_start: this Page has no website domain to send to')
        if (!input.email || !emailAtDomain(input.email, options.emailDomain)) {
          throw new ValidationError(`group.claim_start: the address must be at ${options.emailDomain}`)
        }
        target = input.email.trim().toLowerCase()
      } else {
        if (!options.phone) throw new ValidationError('group.claim_start: no phone to send to')
        target = options.phone
      }
      const now = ctx.now()
      await requireUnderLimits(client, memberId, input.groupId, now)
      // A fresh start replaces this member's earlier code for the Page.
      await client.query(
        `update public.page_claims set status = 'superseded', decided_at = $3
          where group_id = $1 and claimant_member_id = $2 and status = 'pending'`,
        [input.groupId, memberId, now],
      )
      const id = (await client.query<{ id: string }>(`select gen_random_uuid() as id`, [])).rows[0]!.id
      const code = newCode()
      await client.query(
        `insert into public.page_claims (id, group_id, claimant_member_id, method, target, code_hash, expires_at, created_at)
         values ($1, $2, $3, $4, $5, $6, $7::timestamptz + make_interval(mins => $8), $7)`,
        [id, input.groupId, memberId, input.method, target, hashCode(id, code), now, CLAIM_LIMITS.codeMinutes],
      )
      await logEvent(client, id, input.groupId, 'claim.started', memberId, { method: input.method })
      return { claimId: id, method: input.method, target, pageName: page.name, code }
    })
  },
)

export const groupClaimVerifyInput = z.object({
  claimId: z.string().uuid(),
  code: z.string().trim().regex(/^\d{6}$/),
})

export const groupClaimVerify = defineHandler(
  'group.claim_verify',
  groupClaimVerifyInput,
  async (ctx: ActionContext, input): Promise<{ groupId: string }> => {
    const memberId = ctx.actingMemberId
    // A wrong code must count even though the call fails, so the attempt is committed before the refusal.
    const outcome = await withTransaction(async (client) => {
      const res = await client.query<{ id: string; group_id: string; claimant_member_id: string; code_hash: string; expires_at: Date; attempts: number; status: string }>(
        `select id, group_id, claimant_member_id, code_hash, expires_at, attempts, status from public.page_claims
          where id = $1 and method <> 'proof' for update`,
        [input.claimId],
      )
      const claim = res.rows[0]
      if (!claim || claim.claimant_member_id !== memberId) throw new NotFoundError(`group.claim_verify: no claim ${input.claimId}`)
      const page = await lockPage(client, claim.group_id, 'group.claim_verify')
      await requireStillUnclaimed(client, page, claim.group_id, memberId, claim.id)
      const now = ctx.now()
      if (claim.status !== 'pending' || claim.attempts >= CLAIM_LIMITS.attempts || new Date(claim.expires_at) <= now) {
        return 'expired' as const
      }
      if (hashCode(claim.id, input.code) !== claim.code_hash) {
        await client.query(`update public.page_claims set attempts = attempts + 1 where id = $1`, [claim.id])
        await logEvent(client, claim.id, claim.group_id, 'claim.code_failed', memberId, { attempt: claim.attempts + 1 })
        return 'wrong' as const
      }
      await client.query(`update public.page_claims set status = 'verified', decided_at = $2 where id = $1`, [claim.id, now])
      await logEvent(client, claim.id, claim.group_id, 'claim.verified', memberId)
      await completeClaim(ctx, client, claim, now)
      return claim.group_id
    })
    if (outcome === 'wrong') throw new ValidationError(CLAIM_REFUSED.wrongCode)
    if (outcome === 'expired') throw new ValidationError(CLAIM_REFUSED.expired)
    return { groupId: outcome }
  },
)

export const groupClaimProofInput = z.object({
  groupId: z.string().uuid(),
  proofUrl: z.string().trim().url().regex(/^https:\/\//).max(500),
  note: z.string().trim().max(1000).optional(),
})

export const groupClaimProof = defineHandler(
  'group.claim_proof',
  groupClaimProofInput,
  async (ctx: ActionContext, input): Promise<{ claimId: string }> => {
    const memberId = ctx.actingMemberId
    return withTransaction(async (client) => {
      const page = await lockPage(client, input.groupId, 'group.claim_proof')
      await requireStillUnclaimed(client, page, input.groupId, memberId, null)
      const options = claimOptions({ publicInfoUrl: page.public_info_url, contactPhone: page.contact_phone, phoneEnabled: phoneClaimsEnabled() })
      if (!options.proof) throw new ValidationError('group.claim_proof: this Page can be claimed with a code')
      const now = ctx.now()
      await requireUnderLimits(client, memberId, input.groupId, now)
      const res = await client.query<{ id: string }>(
        `insert into public.page_claims (group_id, claimant_member_id, method, proof_url, proof_note, status, created_at)
         values ($1, $2, 'proof', $3, $4, 'review', $5) returning id`,
        [input.groupId, memberId, input.proofUrl, input.note || null, now],
      )
      const claimId = res.rows[0]!.id
      await logEvent(client, claimId, input.groupId, 'claim.proof_submitted', memberId)
      return { claimId }
    })
  },
)

export const groupClaimDecideInput = z.object({
  claimId: z.string().uuid(),
  approve: z.boolean(),
})

export const groupClaimDecide = defineHandler(
  'group.claim_decide',
  groupClaimDecideInput,
  async (ctx: ActionContext, input): Promise<{ status: 'approved' | 'declined' }> => {
    const operator = await requirePermission(ctx, 'unclaimed.manage', 'group.claim_decide')
    return withTransaction(async (client) => {
      const res = await client.query<{ id: string; group_id: string; claimant_member_id: string; status: string }>(
        `select id, group_id, claimant_member_id, status from public.page_claims where id = $1 and method = 'proof' for update`,
        [input.claimId],
      )
      const claim = res.rows[0]
      if (!claim || claim.status !== 'review') throw new NotFoundError(`group.claim_decide: no claim waiting ${input.claimId}`)
      if (claim.claimant_member_id === operator) throw new AuthorizationError('group.claim_decide: not your own claim')
      const now = ctx.now()
      const page = await lockPage(client, claim.group_id, 'group.claim_decide')
      if (!input.approve) {
        await client.query(`update public.page_claims set status = 'declined', decided_at = $2 where id = $1`, [claim.id, now])
        await logEvent(client, claim.id, claim.group_id, 'claim.declined', operator)
        return { status: 'declined' as const }
      }
      await requireStillUnclaimed(client, page, claim.group_id, operator, claim.id)
      await client.query(`update public.page_claims set status = 'approved', decided_at = $2 where id = $1`, [claim.id, now])
      await logEvent(client, claim.id, claim.group_id, 'claim.approved', operator)
      await completeClaim(ctx, client, claim, now)
      return { status: 'approved' as const }
    })
  },
)
