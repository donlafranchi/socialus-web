'use server'

// T097 — Server actions for the F037 Locally Owned claim widget.
// Spec:   planning/now/scenario-F037-maya-claims-locally-owned.md
// Ticket: development/tickets/T097-locally-owned-claim-widget.md
//
// Thin wrappers over the T075 jurisdiction handlers, mirroring
// src/app/you/sell/actions.ts. The client widget never touches credentials:
//   1. Resolve the auth user via @supabase/ssr (cookie session).
//   2. Build an ActionContext with actingMemberId = user.id.
//   3. Invoke the handler (which authorizes owner-role itself, throws
//      AuthorizationError for non-owners). Map ActionError → a serializable
//      Error the client surfaces inline.
//
// `.set` folds update into a soft-replace (T075 deviation #4): both the
// empty-state Add and the Edit path call setJurisdictionAction.

import { createClient } from '@/lib/supabase-server'
import { resolveOwnerClaim, resolveLocalOwnerBadge } from '@/lib/groups/resolve-shop'
import type { LocalOwnerClaimState } from '@/components/group/LocalOwnerClaimState'
import { resolveActionContext } from '@/lib/action-context'
import {
  memberBusinessJurisdictionSet,
  memberBusinessJurisdictionRemove,
  ActionError,
} from '@/actions'

class ClaimActionError extends Error {
  code: string
  constructor(message: string, code: string) {
    super(message)
    this.code = code
  }
}

async function requireMemberId(): Promise<string> {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) {
    throw new ClaimActionError('You must be signed in to manage this claim.', 'unauthenticated')
  }
  return data.user.id
}

function rethrow(err: unknown): never {
  if (err instanceof ActionError) {
    throw new ClaimActionError(err.message, err.code)
  }
  throw err
}

export async function setJurisdictionAction(input: {
  groupId: string
  zip: string
}): Promise<LocalOwnerClaimState> {
  const memberId = await requireMemberId()
  const ctx = resolveActionContext({ actingMemberId: memberId })
  try {
    await memberBusinessJurisdictionSet(ctx, { groupId: input.groupId, zip: input.zip })
  } catch (err) {
    rethrow(err)
  }
  return claimState(input.groupId, memberId)
}

export async function removeJurisdictionAction(input: {
  groupId: string
}): Promise<LocalOwnerClaimState> {
  const memberId = await requireMemberId()
  const ctx = resolveActionContext({ actingMemberId: memberId })
  try {
    await memberBusinessJurisdictionRemove(ctx, { groupId: input.groupId })
  } catch (err) {
    rethrow(err)
  }
  return claimState(input.groupId, memberId)
}

/** #806 — the claim and badge as they stand after a save, read as the caller, for the Page to show. */
async function claimState(groupId: string, memberId: string): Promise<LocalOwnerClaimState> {
  const supabase = await createClient()
  const { data } = await supabase.from('groups').select('anchor_location_id').eq('id', groupId).maybeSingle()
  const anchorLocationId = (data as { anchor_location_id: string | null } | null)?.anchor_location_id ?? null
  const [claim, badge] = await Promise.all([
    resolveOwnerClaim(supabase, { groupId, anchorLocationId, viewerMemberId: memberId }),
    resolveLocalOwnerBadge(supabase, { groupId, anchorLocationId }),
  ])
  return { claim: claim ?? { zip: null, isProximal: false }, badge }
}
