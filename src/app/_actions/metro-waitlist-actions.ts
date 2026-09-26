'use server'

// T163 (#77) — the waitlist step's server action.
//
// Shape follows group-membership-actions.ts: createClient → getUser →
// resolveActionContext → handler → catch ActionError.
//
// WHAT COMES BACK IS ONE NUMBER. `metro_polygons` stores the two counts
// separately (criterion 6) and the eligibility rule reads both (criterion 10),
// but the browser is handed `{ combined, target }` and a message. The split is
// how the platform decides; 300 is what the person reads, and a popup that
// carries the split is the popup criterion 8 forbids — so it never leaves the
// server rather than being left out of the markup by hand.

import { createClient } from '@/lib/supabase-server'
import { resolveActionContext } from '@/lib/action-context'
import { resolveAnonymousActionContext } from '@/lib/action-context'
import {
  metroWaitlistJoin,
  metroWaitlistJoinAnonymous,
  ActionError,
  type WaitlistRole,
} from '@/actions'
import {
  metroStanding,
  standingMessage,
  standingFromCombined,
} from '@/lib/metro/waitlist-standing'
import { waitingCountFor } from '@/lib/metro/waitlist-counts'

export interface JoinMetroWaitlistResult {
  /** True when the metro is already live — there is nothing to wait for. */
  open: boolean
  metroName: string
  /** Exactly what the popup renders. */
  standing: { combined: number; target: number }
  message: string
}

interface MetroRow {
  id: string
  name: string
  is_open: boolean
  creator_count: number
  patron_count: number
  creator_threshold: number
  patron_threshold: number
}

export async function joinMetroWaitlistAction(input: {
  metroId: string
  role: WaitlistRole
}): Promise<JoinMetroWaitlistResult> {
  const supabase = await createClient()
  const { data: auth, error: authError } = await supabase.auth.getUser()
  if (authError || !auth.user) throw new Error('You must be signed in.')

  const read = async (): Promise<MetroRow> => {
    const { data, error } = await supabase
      .from('metro_polygons')
      .select(
        'id, name, is_open, creator_count, patron_count, creator_threshold, patron_threshold',
      )
      .eq('id', input.metroId)
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (!data) throw new Error('That metro is not on the list.')
    return data as MetroRow
  }

  const before = await read()

  // An open metro has no waitlist. Joining one would create a row that counts
  // toward a threshold already passed, and the popup would be telling someone
  // to wait for a place they can already use.
  if (before.is_open) {
    return {
      open: true,
      metroName: before.name,
      standing: { combined: 0, target: 0 },
      message: '',
    }
  }

  const ctx = resolveActionContext({ actingMemberId: auth.user.id })
  try {
    await metroWaitlistJoin(ctx, { metroId: input.metroId, role: input.role })
  } catch (err) {
    if (err instanceof ActionError) throw new Error(err.message)
    throw err
  }

  // Read back AFTER the write, so the person sees a number that includes them.
  const after = await read()
  const standing = metroStanding({
    creatorCount: after.creator_count,
    patronCount: after.patron_count,
    creatorThreshold: after.creator_threshold,
    patronThreshold: after.patron_threshold,
  })

  return {
    open: false,
    metroName: after.name,
    standing: standing.display,
    message: standingMessage(standing),
  }
}

// T167 (#193) — F076 criteria 13-15: the same step, without an account.
//
// NO `getUser()`, AND NO SUPABASE CLIENT ON THE WRITE PATH. The signed-in
// action above reads `metro_polygons` through the browser client twice, around
// the write. This one reads nothing around the write at all.
//
// THE COUNT IS BACK, AND IT IS CACHED — ruled 2026-09-23, reversing #196.
// `waitingCountFor` serves a figure that was current up to an hour ago and is
// shared with the metro picker's ordering, so it does not move in response to
// this submission. That is what removes the oracle: the earlier attempt read
// the live count before the write, which does not help, because the thing that
// leaks is any number that is a function of what you just did.
//
// The residual is stated where the cache is defined, not glossed here.
//
// The signed-in action above still reads the LIVE count after its write, and
// that stays: a member is entitled to see themselves counted, and there is no
// oracle on that path — you are authenticated as yourself and cannot probe
// somebody else's address with it.
export interface JoinMetroWaitlistAnonymousResult {
  /** True when the metro is already live — there is nothing to wait for. */
  open: boolean
  metroName: string
  /**
   * The cached standing, or null when the metro is missing from the snapshot.
   * Null renders no number rather than a confident zero.
   */
  standing: { combined: number; target: number } | null
  message: string
}

export async function joinMetroWaitlistAnonymousAction(input: {
  metroId: string
  email: string
  role: WaitlistRole
}): Promise<JoinMetroWaitlistAnonymousResult> {
  const ctx = resolveAnonymousActionContext()

  let result
  try {
    result = await metroWaitlistJoinAnonymous(ctx, {
      metroId: input.metroId,
      email: input.email,
      role: input.role,
    })
  } catch (err) {
    if (err instanceof ActionError) throw new Error(err.message)
    throw err
  }

  if (result.open) {
    return { open: true, metroName: result.metroName, standing: null, message: '' }
  }

  // Cached. Not a read of this metro's current counters — see above.
  const waiting = await waitingCountFor(result.metroId)
  const standing = waiting === null ? null : standingFromCombined(waiting)

  return {
    open: false,
    metroName: result.metroName,
    standing,
    message: standing ? standingMessage(standing) : '',
  }
}
