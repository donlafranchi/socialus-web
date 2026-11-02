'use server'

// plan #258 — a "Show on map" or Directions tap, counted per day with no member id. Signed in only; never fails a page.

import { createClient } from '@/lib/supabase-server'
import { resolveActionContext } from '@/lib/action-context'
import { mapLog, MAP_TAP_KINDS } from '@/actions'

export async function logMapTapAction(kind: (typeof MAP_TAP_KINDS)[number], target?: string): Promise<void> {
  try {
    const supabase = await createClient()
    const { data } = await supabase.auth.getUser()
    if (!data.user) return
    await mapLog(resolveActionContext({ actingMemberId: data.user.id }), { kind, ...(target ? { target: target.slice(0, 600) } : {}) })
  } catch {
    // Counting a tap is never worth an error.
  }
}
