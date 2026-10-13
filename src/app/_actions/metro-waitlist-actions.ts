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
  standingMessage,
  standingFromCombined,
} from '@/lib/metro/waitlist-standing'
import { waitingCountFor } from '@/lib/metro/waitlist-counts'

export interface JoinMetroWaitlistResult {
  /** True when the metro is already live — there is nothing to wait for. */
  open: boolean
  metroName: string
  /**
   * Exactly what the popup renders: the cached standing, or null when the
   * metro is missing from the snapshot (no number rather than a confident zero).
   */
  standing: { combined: number; target: number } | null
  message: string
}

// No counters: a read of the live count here is a surface that can disagree
// with the cached figure (F076 criteria 8 and 14). tests/f076-never-rules.test.ts.
interface MetroRow {
  id: string
  name: string
  is_open: boolean
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
        'id, name, is_open',
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

  // F076 criteria 7 and 8: the same CACHED figure the anonymous popup and the
  // metro picker use, never a read of the counters after this write. A fresher
  // number on any surface reopens criterion 14.
  const waiting = await waitingCountFor(input.metroId)
  const standing = waiting === null ? null : standingFromCombined(waiting)

  return {
    open: false,
    metroName: before.name,
    standing,
    message: standing ? standingMessage(standing) : '',
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
// The signed-in action above shows the same cached figure (F076 criteria 7 and 8:
// everyone sees one count, and it is the cached one).
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
