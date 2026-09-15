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
import { metroWaitlistJoin, ActionError, type WaitlistRole } from '@/actions'
import { metroStanding, standingMessage } from '@/lib/metro/waitlist-standing'

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
