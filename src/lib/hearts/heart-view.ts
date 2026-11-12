// #1171 — the hearts on one Page and its posts, from the database's heart_view: counts and names, newest first, for
// its managers; nothing for anyone else unless public counts are on (heart_counts_public), then counts only.
import type { SupabaseClient } from '@supabase/supabase-js'

export interface HeartTally {
  count: number
  /** Managers only. */
  names?: string[]
}

export interface HeartView {
  manages: boolean
  page: HeartTally
  posts: Record<string, HeartTally>
}

export async function loadHeartView(supabase: SupabaseClient, groupId: string): Promise<HeartView | null> {
  const { data, error } = await supabase.rpc('heart_view', { p_group_id: groupId })
  if (error || !data) return null
  const raw = data as { manages: boolean; page: HeartTally; posts: (HeartTally & { postId: string })[] }
  return { manages: raw.manages, page: raw.page, posts: Object.fromEntries(raw.posts.map(({ postId, ...t }) => [postId, t])) }
}
