// #348 — where a Page is (Don, 2026-10-04), for signed-in visitors only: the
// columns and page_service_areas are granted to `authenticated`, so a
// signed-out read would be refused; the loader never makes one.

import type { SupabaseClient } from '@supabase/supabase-js'

export interface PageWhere {
  mode: 'visit' | 'travel' | 'roaming' | null
  howToFind: string | null
  usuallyAround: string | null
  towns: { id: string; name: string }[]
}

export async function resolvePageWhere(supabase: SupabaseClient, groupId: string): Promise<PageWhere | null> {
  try {
    const { data } = await supabase.from('groups').select('where_mode, how_to_find, usually_around').eq('id', groupId).maybeSingle()
    if (!data) return null
    const row = data as { where_mode: PageWhere['mode']; how_to_find: string | null; usually_around: string | null }
    const { data: areas } = await supabase.from('page_service_areas').select('places(id, display_name)').eq('group_id', groupId)
    const towns = ((areas ?? []) as unknown as { places: { id: string; display_name: string } | null }[])
      .flatMap((a) => (a.places ? [{ id: a.places.id, name: a.places.display_name }] : []))
    return { mode: row.where_mode, howToFind: row.how_to_find, usuallyAround: row.usually_around, towns }
  } catch {
    return null
  }
}

const list = (names: string[]) => (names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`)

/** The one line a visitor reads, or null when there's nothing to add. */
export function whereLine(w: PageWhere): string | null {
  if (w.mode === 'visit') return w.howToFind ? `How to find us: ${w.howToFind}` : null
  if (w.mode === 'travel') {
    return w.towns.length === 0 ? 'Comes to you anywhere in the Sacramento area' : `Comes to you in ${list(w.towns.map((t) => t.name))}`
  }
  if (w.mode === 'roaming') {
    return w.usuallyAround ? `Around the Sacramento area, usually ${w.usuallyAround}` : 'Around the Sacramento area'
  }
  return null
}
