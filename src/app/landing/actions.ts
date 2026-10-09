'use server'

// /landing — the waitlist form's server action. A zip, not a metro picker:
// `metroForZip` resolves it (F081, #222) and the existing anonymous join
// handler stores the address (F076 criteria 13-15). No new table, no count
// shown: an anonymous submitter sees the same words whether or not the address
// was already waiting.

import { createClient } from '@/lib/supabase-server'
import { resolveAnonymousActionContext } from '@/lib/action-context'
import { metroForZip } from '@/lib/signup/zip-metro'
import { metroWaitlistJoinAnonymous, ActionError } from '@/actions'

const ZIP = /^\d{5}$/

export type LandingWaitlistResult =
  | { kind: 'waiting' }
  | { kind: 'open' }
  | { kind: 'outside' }
  | { kind: 'error'; field: 'email' | 'zip' | null; message: string }

export async function joinLandingWaitlistAction(input: {
  email: string
  zip: string
  runsSomething: boolean
  wouldHelp: boolean
}): Promise<LandingWaitlistResult> {
  const zip = input.zip.trim()
  if (!ZIP.test(zip)) return { kind: 'error', field: 'zip', message: 'Enter a 5-digit zip code.' }

  const supabase = await createClient()
  const metro = await metroForZip(supabase, zip)
  // TODO(landing): a zip outside every seeded metro is not stored anywhere yet.
  // The anonymous waitlist needs a metro row, and there is none to attach to.
  if (!metro) return { kind: 'outside' }

  // TODO(landing): `wouldHelp` is not stored. The waitlist entry has no column
  // for it (no migration in this change); it is read here so the form can send
  // it once there is somewhere for it to go.
  void input.wouldHelp

  try {
    const result = await metroWaitlistJoinAnonymous(resolveAnonymousActionContext(), {
      metroId: metro.id,
      email: input.email,
      role: input.runsSomething ? 'creator' : 'patron',
    })
    return result.open ? { kind: 'open' } : { kind: 'waiting' }
  } catch (err) {
    if (err instanceof ActionError) {
      const email = /email/i.test(err.message)
      return { kind: 'error', field: email ? 'email' : null, message: email ? 'That does not look like an email address.' : err.message }
    }
    return { kind: 'error', field: null, message: 'That didn’t go through. Mind trying again?' }
  }
}
