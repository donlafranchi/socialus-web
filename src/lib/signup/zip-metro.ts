// #222 (F081) — the zip is looked up once to one metro, and only the metro is
// kept as the member's home. Nothing else decides it: not IP, not a default,
// not a nearest match; an unknown zip has no metro.
//
// The crosswalk speaks MSA (CBSA 40900 = Sacramento); metro_polygons rows are
// keyed by slug. One metro runs in beta, so the bridge is one line, and another
// metro opens by adding its line here.

import type { SupabaseClient } from '@supabase/supabase-js'

const MSA_METRO_SLUG: Record<string, string> = { '40900': 'sacramento-roseville-ca' }

export interface ZipMetro {
  id: string
  name: string
}

export async function metroForZip(supabase: Pick<SupabaseClient, 'from'>, zip: string): Promise<ZipMetro | null> {
  const { data: row, error } = await supabase.from('zip_metro_crosswalk').select('msa_code').eq('zip', zip).maybeSingle()
  if (error || !row) return null
  const slug = MSA_METRO_SLUG[(row as { msa_code: string }).msa_code]
  if (!slug) return null
  const { data: metro, error: metroError } = await supabase.from('metro_polygons').select('id, name').eq('slug', slug).maybeSingle()
  if (metroError || !metro) return null
  const m = metro as { id: string; name: string }
  return { id: m.id, name: m.name }
}
