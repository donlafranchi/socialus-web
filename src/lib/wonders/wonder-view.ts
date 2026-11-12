// F117 — what one viewer may see of a Wonder, from the database's wonder_view projection.
// Who is in arrives by name for every viewer (inNames, newest first, at most 50); the size split, each person's
// size and every offer arrive only for the Page's managers. The database decides that.
import type { SupabaseClient } from '@supabase/supabase-js'
import type { WonderRole } from './roles'

export interface WonderView {
  total: number
  /** Null: the poster set no goal, so there is a count and no bar. */
  threshold: number | null
  options: string[]
  mine: { option: string | null } | null
  myOffers: { id: string; role: WonderRole; status: 'pending' | 'accepted' | 'declined' }[]
  helpers: { name: string; role: WonderRole }[]
  inNames?: string[]
  byOption?: { option: string; count: number }[]
  people?: { name: string; option: string | null }[]
  offers?: { id: string; name: string; role: WonderRole; note: string | null; status: 'pending' | 'accepted' | 'declined' }[]
}

/** One read per Wonder on the Page, in parallel. A failed read costs that Wonder its panel, never the Page. */
export async function loadWonderViews(supabase: SupabaseClient, postIds: string[]): Promise<Record<string, WonderView>> {
  const out: Record<string, WonderView> = {}
  await Promise.all(
    postIds.map(async (id) => {
      const { data, error } = await supabase.rpc('wonder_view', { p_post_id: id })
      if (!error && data) out[id] = data as WonderView
    }),
  )
  return out
}
