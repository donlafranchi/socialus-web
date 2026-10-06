import type { SupabaseClient } from '@supabase/supabase-js'

/** #371 — a Page's metadata: its components and badges. */
export async function resolvePageMetadata(supabase: SupabaseClient, groupId: string): Promise<unknown> {
  const { data } = await supabase.from('groups').select('metadata').eq('id', groupId).maybeSingle()
  return (data as { metadata?: unknown } | null)?.metadata ?? null
}
