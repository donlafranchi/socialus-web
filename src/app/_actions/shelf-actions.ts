'use server'

// F121 — a shelf's impression, tap or save, counted with no member id. Signed in only; never fails Explore.

import { createClient } from '@/lib/supabase-server'
import { resolveActionContext } from '@/lib/action-context'
import { shelfLog, SHELF_EVENTS } from '@/actions'

export async function logShelfAction(shelfId: string, event: (typeof SHELF_EVENTS)[number], item?: string): Promise<void> {
  try {
    const supabase = await createClient()
    const { data } = await supabase.auth.getUser()
    if (!data.user) return
    await shelfLog(resolveActionContext({ actingMemberId: data.user.id }), { shelfId, event, ...(item ? { item: item.slice(0, 300) } : {}) })
  } catch {
    // Counting a shelf is never worth an error on Explore.
  }
}
