// The metros a person can choose between on Browse.
//
// Reads `metro_polygons`, which is where metro data actually lives — there is
// no `metros` table, and code that looked for one would find nothing. 296 rows
// are seeded; `metro_select_public` allows `select` to anon and authenticated
// alike, so a signed-out visitor sees the same list.
//
// Two groups, and the split is the honest part: `is_open` marks a metro the
// platform actually serves. Exactly one is open today. A picker that offered
// 296 metros as equals would imply we cover all of them, so the open ones come
// first and under their own heading, and the rest are plainly what they are —
// places you can name, not places we serve.

import type { SupabaseClient } from '@supabase/supabase-js'

export interface ChoosableMetro {
  id: string
  slug: string
  name: string
  /** Does the platform actually serve this metro today? */
  isOpen: boolean
}

type FromClient = Pick<SupabaseClient, 'from'>

export async function fetchChoosableMetros(client: FromClient): Promise<ChoosableMetro[]> {
  const { data, error } = await client
    .from('metro_polygons')
    .select('id, slug, name, is_open')
    // Open first, then alphabetical — a native select's typeahead lands where a
    // person expects within each group.
    .order('is_open', { ascending: false })
    .order('name')

  if (error) {
    // Loud. A silently empty picker is what "there are no metros to choose
    // from" looked like, and the data was there the whole time.
    console.error('[fetchChoosableMetros] query failed:', error.message)
    return []
  }

  return ((data ?? []) as { id: string; slug: string; name: string; is_open: boolean }[]).map((m) => ({
    id: m.id,
    slug: m.slug,
    name: m.name,
    isOpen: m.is_open,
  }))
}

export function splitByOpen(metros: readonly ChoosableMetro[]): {
  open: ChoosableMetro[]
  notYet: ChoosableMetro[]
} {
  return {
    open: metros.filter((m) => m.isOpen),
    notYet: metros.filter((m) => !m.isOpen),
  }
}
