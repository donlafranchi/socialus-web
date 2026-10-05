// #316 — a Page's tag labels, as the caller may read them: signed in only
// (page_tags and tags answer `authenticated`), visible tags only.
import type { SupabaseClient } from '@supabase/supabase-js'

export async function resolvePageTags(supabase: SupabaseClient, groupId: string): Promise<string[]> {
  try {
    const { data } = await supabase.from('page_tags').select('tags(label)').eq('group_id', groupId)
    return ((data ?? []) as unknown as { tags: { label: string } | { label: string }[] | null }[])
      .map((r) => (Array.isArray(r.tags) ? r.tags[0] : r.tags)?.label)
      .filter((l): l is string => Boolean(l))
      .sort((a, b) => a.localeCompare(b))
  } catch {
    return []
  }
}
