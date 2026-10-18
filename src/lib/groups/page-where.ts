// #348 — where a Page is (Don, 2026-10-04), for signed-in visitors only: the
// columns and page_service_areas are granted to `authenticated`, so a
// signed-out read would be refused; the loader never makes one.

import type { SupabaseClient } from '@supabase/supabase-js'
import { maskEmails } from '@/lib/text/contact-info'

export interface PageStop {
  label: string
  whenText: string | null
}

export interface PageWhere {
  /** #896 — landmark, multi and online join the first three (Don, 2026-10-18). */
  mode: 'visit' | 'landmark' | 'multi' | 'roaming' | 'travel' | 'online' | null
  howToFind: string | null
  usuallyAround: string | null
  towns: { id: string; name: string }[]
  /** More than one location (an address each), or where and when it moves. */
  stops?: PageStop[]
}

export async function resolvePageWhere(supabase: SupabaseClient, groupId: string): Promise<PageWhere | null> {
  try {
    const { data } = await supabase.from('groups').select('where_mode, how_to_find, usually_around').eq('id', groupId).maybeSingle()
    if (!data) return null
    const row = data as { where_mode: PageWhere['mode']; how_to_find: string | null; usually_around: string | null }
    const { data: areas } = await supabase.from('page_service_areas').select('places(id, display_name)').eq('group_id', groupId)
    const towns = ((areas ?? []) as unknown as { places: { id: string; display_name: string } | null }[])
      .flatMap((a) => (a.places ? [{ id: a.places.id, name: a.places.display_name }] : []))
    const { data: stopRows } = await supabase.from('page_stops').select('label, when_text').eq('group_id', groupId).order('position')
    const stops = ((stopRows ?? []) as { label: string; when_text: string | null }[]).map((r) => ({ label: r.label, whenText: r.when_text }))
    return { mode: row.where_mode, howToFind: row.how_to_find, usuallyAround: row.usually_around, towns, stops }
  } catch {
    return null
  }
}

/** #894 — "It moves" and "I go to them" anchor to the metro only so the Page scopes to its market; that anchor is no fixed place.
 *  #896 — nor is it for more than one location, or online. */
const NO_FIXED_PLACE: PageWhere['mode'][] = ['roaming', 'travel', 'multi', 'online']
export const fixedPlacement = <P>(w: Pick<PageWhere, 'mode'> | null | undefined, placement: P | undefined): P | undefined =>
  w && NO_FIXED_PLACE.includes(w.mode) ? undefined : placement

const list = (names: string[]) => (names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`)

/** The one line a visitor reads, or null when there's nothing to add. */
export function whereLine(w: PageWhere): string | null {
  if (w.mode === 'visit' || w.mode === 'landmark') return w.howToFind ? `How to find us: ${maskEmails(w.howToFind)}` : null
  if (w.mode === 'online') return w.howToFind ? maskEmails(w.howToFind) : 'Online, or by appointment'
  if (w.mode === 'travel') {
    return w.towns.length === 0 ? 'Comes to you anywhere in the Sacramento area' : `Comes to you in ${list(w.towns.map((t) => t.name))}`
  }
  if (w.mode === 'roaming') {
    return w.usuallyAround ? `Around the Sacramento area, usually ${maskEmails(w.usuallyAround)}` : 'Around the Sacramento area'
  }
  return null
}

/** #894 — what the Location card says it is now: the fixed place, else the Page's own line. */
export function whereNow(w: PageWhere | null | undefined, placement: { label: string } | undefined): string | null {
  const stops = w?.stops ?? []
  if (w?.mode === 'multi' && stops.length > 0) return stops.length === 1 ? stops[0]!.label : `${stops[0]!.label} and ${stops.length - 1} more`
  return fixedPlacement(w, placement)?.label || (w ? whereLine(w) : null)
}
