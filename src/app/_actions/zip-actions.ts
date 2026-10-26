'use server'

// #568 / #695 (F081.4, F103.5) — change the zip on /you. Failures come back as data, never as a throw (Next
// replaces a thrown message across the server-action boundary). The home town is stored, never sent to the browser.

import { createClient } from '@/lib/supabase-server'
import { resolveActionContext } from '@/lib/action-context'
import { memberZipSet, ActionError } from '@/actions'

export async function changeZipAction(
  zip: string,
): Promise<{ ok: true; marketName: string; open: boolean } | { ok: false; message: string }> {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) return { ok: false, message: 'Sign in first.' }
  try {
    const r = await memberZipSet(resolveActionContext({ actingMemberId: data.user.id }), { zip })
    return { ok: true, marketName: r.marketName, open: r.open }
  } catch (err) {
    // A validation error's message is the plain refusal ("We don't recognize that zip"); nothing else leaks.
    if (err instanceof ActionError && err.code === 'validation_error') return { ok: false, message: err.message }
    return { ok: false, message: "That didn't go through. Mind trying again?" }
  }
}
