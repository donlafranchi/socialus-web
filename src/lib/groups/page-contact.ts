// #293 — a Page's business phone and opening hours. Signed-in callers only:
// the columns are granted to `authenticated` and nobody else, so a signed-out
// read would be refused; the loader never makes one.

import type { SupabaseClient } from '@supabase/supabase-js'
import { parseOpeningHours, type OpeningHours } from './opening-hours'

export interface PageContact {
  phone: string | null
  hours: OpeningHours | null
}

export async function resolvePageContact(supabase: SupabaseClient, groupId: string): Promise<PageContact | null> {
  try {
    const { data, error } = await supabase
      .from('groups')
      .select('contact_phone, opening_hours')
      .eq('id', groupId)
      .maybeSingle()
    if (error || !data) return null
    const row = data as { contact_phone: string | null; opening_hours: unknown }
    let hours: OpeningHours | null = null
    try {
      hours = parseOpeningHours(row.opening_hours)
    } catch {
      hours = null
    }
    return { phone: row.contact_phone, hours }
  } catch {
    return null
  }
}
