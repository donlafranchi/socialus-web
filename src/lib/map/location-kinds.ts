// #475 — browse_feed returns a row's location id but not its kind. The map
// needs it: an exact address is a pin, a place known only as an area is a disc.
// One read for the distinct ids; a failure costs the distinction (rows are then
// treated as addresses, as before), never the map.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { BrowseResult } from '@/lib/feed/browse-feed'

export async function withLocationKinds<T extends BrowseResult>(
  supabase: Pick<SupabaseClient, 'from'>,
  rows: readonly T[],
): Promise<T[]> {
  const ids = [...new Set(rows.map((r) => r.locationId).filter((id): id is string => Boolean(id)))]
  if (ids.length === 0) return [...rows]
  try {
    const { data, error } = await supabase.from('locations').select('id, kind').in('id', ids)
    if (error) throw error
    const kinds = new Map((data as { id: string; kind: BrowseResult['locationKind'] }[]).map((l) => [l.id, l.kind]))
    return rows.map((r) => (r.locationId && kinds.get(r.locationId) ? { ...r, locationKind: kinds.get(r.locationId) } : r))
  } catch (error) {
    console.error('[map] location kinds not read:', (error as Error).message)
    return [...rows]
  }
}
