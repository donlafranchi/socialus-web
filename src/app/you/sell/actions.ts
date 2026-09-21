'use server'

// T073 — Server actions for the Sell walkthrough.
// Spec:   planning/now/scenario-F036-member-creates-business-group-via-sell-walkthrough.md
// Ticket: development/tickets/T073-sell-walkthrough-and-you-sell-cta.md
//
// Thin server-action wrappers around the group action handlers (T070).
// Sit between the client-side SellWalkthrough and the pg-backed handlers so
// the client never touches credentials. Each action:
//
//   1. Resolves the auth user via @supabase/ssr (cookie session).
//   2. Builds an ActionContext with actingMemberId = user.id
//      (members.id IS auth.users.id per 009_members_phase1 constraint trigger).
//   3. Invokes the handler. Maps ActionError → a JSON-serializable shape
//      the client can use to surface inline / toast messages.

import { createClient } from '@/lib/supabase-server'
import { canonicalPagePath } from '@/lib/groups/page-handle'
import { resolveActionContext } from '@/lib/action-context'
import { succeeded, failed, type ActionResult } from './action-result'
import { withTransaction } from '@/actions/_lib/db'
import {
  groupCreate,
  groupUpdateDraft,
  groupActivate,
  ActionError,
} from '@/actions'

/** Discriminated error result the client surfaces. The composer's submit
 *  catches a thrown Error and renders its `.message`; we throw to preserve
 *  that path while keeping the structure for any caller that wants codes. */
class SellActionError extends Error {
  code: string
  constructor(message: string, code: string) {
    super(message)
    this.code = code
  }
}

/**
 * #107 — run an action body and return its failure as DATA.
 *
 * A custom Error thrown from a 'use server' function does not cross the
 * boundary: Next replaces it with a generic digest and the message is gone.
 * Every message in this file used to die that way, which is how a creation
 * crash reached Don with nothing to read.
 *
 * The client adapter in SellCta turns a returned failure back into a throw,
 * so the composer's existing catch still works — but the throw now happens
 * on the client, where the message survives.
 */
async function asResult<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return succeeded(await fn())
  } catch (err) {
    if (err instanceof SellActionError) return failed(err.message, err.code)
    if (err instanceof ActionError) return failed(err.message, err.code)
    // An unexpected error still gets a readable sentence rather than a digest.
    // The detail stays in the server log, where it belongs.
    console.error('sell action failed:', err)
    return failed('Something went wrong on our end. Mind trying again?', 'unexpected')
  }
}

async function requireMemberId(): Promise<string> {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) {
    throw new SellActionError(
      'You must be signed in to start selling.',
      'unauthenticated',
    )
  }
  return data.user.id
}

function rethrow(err: unknown): never {
  if (err instanceof ActionError) {
    throw new SellActionError(err.message, err.code)
  }
  throw err
}

export async function sellCreateDraftAction(input: {
  brand: string
}): Promise<ActionResult<{ groupId: string }>> {
  return asResult(async () => {
  const memberId = await requireMemberId()
  const ctx = resolveActionContext({ actingMemberId: memberId })
  try {
    const result = await groupCreate(ctx, {
      kind: 'business',
      founderMemberId: memberId,
      businessDisplayName: input.brand,
    })
    return { groupId: result.groupId }
  } catch (err) {
    rethrow(err)
  }
  })
}

export async function sellUpdateDraftAction(input: {
  groupId: string
  brand?: string
  anchorLocationId?: string
  about?: string
  photoUrl?: string | null
  socialLinks?: Record<string, string>
}): Promise<void> {
  const memberId = await requireMemberId()
  const ctx = resolveActionContext({ actingMemberId: memberId })
  try {
    await groupUpdateDraft(ctx, {
      groupId: input.groupId,
      ...(input.brand !== undefined
        ? { name: input.brand, businessDisplayName: input.brand }
        : {}),
      ...(input.anchorLocationId !== undefined
        ? { anchorLocationId: input.anchorLocationId }
        : {}),
      ...(input.about !== undefined
        ? { businessPublicDescription: input.about }
        : {}),
      // F070 · T145 — `!== undefined`, so an explicit null clears the photo.
      ...(input.photoUrl !== undefined ? { photoUrl: input.photoUrl } : {}),
      ...(input.socialLinks !== undefined ? { socialLinks: input.socialLinks } : {}),
    })
  } catch (err) {
    rethrow(err)
  }
}

export async function sellActivateAction(input: {
  groupId: string
  tags: string[]
}): Promise<ActionResult<{ destinationUrl: string }>> {
  return asResult(async () => {
  const memberId = await requireMemberId()
  const ctx = resolveActionContext({ actingMemberId: memberId })
  try {
    await groupActivate(ctx, { groupId: input.groupId, tags: input.tags })
  } catch (err) {
    rethrow(err)
  }
  // Issue #175 — the canonical address, which needs no place at all.
  //
  // This used to resolve `groups.anchor_location_id` -> `locations.place_id`
  // -> a walk up `places.parent_id`, and throw `shop_url_unresolved` when any
  // link was missing. The middle link is ALWAYS missing: nothing populates
  // `place_id` for a member-created Location. So a Page finished creation and
  // was handed either an error or an address that led nowhere.
  //
  // A Page's address is now a cosmetic slug plus its own id (ruled 2026-09-21),
  // which is on the row already. No geography, no joins, nothing to fail.
  const { destinationUrl } = await withTransaction(async (client) => {
    const groupRes = await client.query<{ slug: string; public_id: string }>(
      `select slug, public_id from public.groups where id = $1`,
      [input.groupId],
    )
    const group = groupRes.rows[0]
    if (!group?.slug || !group.public_id) {
      throw new SellActionError(
        'Your Page was created, but we could not resolve its address. Refresh /you to see it.',
        'shop_url_unresolved',
      )
    }
    return { destinationUrl: canonicalPagePath(group.slug, group.public_id) }
  })
  return { destinationUrl }
  })
}

// Issue #180 — the Location and place actions moved to
// `src/app/_actions/location-actions.ts`. They are not about selling: they are
// how anything on SocialUs says where it is, and the Page edit form needs them
// as much as this walkthrough does.
//
// NOT RE-EXPORTED FROM HERE, though that was the first attempt. A 'use server'
// module may export nothing but async functions — not a type, and not a
// re-export binding either. Turbopack's answer to one is to give the module NO
// exports at all, so every caller of every OTHER action in this file fails to
// resolve, with an error naming the caller and never the cause. Callers import
// the new module directly.
