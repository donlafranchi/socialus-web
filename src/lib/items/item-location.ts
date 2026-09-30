// An item's location label, read on its own and as the caller. Signed out the
// database refuses it (F093 criterion 8), and the item resolves without one.
import type { SupabaseClient } from '@supabase/supabase-js'

type Row = { removed_at: string | null; locations: { label: string }[] | { label: string } | null }

export async function itemLocationLabel(supabase: SupabaseClient, itemId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('item_locations')
    .select('removed_at, locations(label)')
    .eq('item_id', itemId)
  if (error || !data) return null
  const active = (data as Row[]).find((r) => r.removed_at === null)
  const loc = Array.isArray(active?.locations) ? active.locations[0] : active?.locations
  return loc?.label ?? null
}
