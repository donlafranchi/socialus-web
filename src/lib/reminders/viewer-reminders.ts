// #945 — the signed-in member's own reminders (post_reminders is readable only by its member), shaped for a Page:
// which posts have a reminder, which series are reminded every time.

import type { SupabaseClient } from '@supabase/supabase-js'

export interface ViewerReminders {
  byPost: Record<string, string>
  bySeries: Record<string, string>
}

export const NO_REMINDERS: ViewerReminders = { byPost: {}, bySeries: {} }

export async function loadViewerReminders(supabase: SupabaseClient, loggedIn: boolean): Promise<ViewerReminders> {
  if (!loggedIn) return NO_REMINDERS
  const { data, error } = await supabase.from('post_reminders').select('id, post_id, series_id')
  if (error || !data) return NO_REMINDERS
  const out: ViewerReminders = { byPost: {}, bySeries: {} }
  for (const r of data as { id: string; post_id: string | null; series_id: string | null }[]) {
    if (r.post_id) out.byPost[r.post_id] = r.id
    if (r.series_id) out.bySeries[r.series_id] = r.id
  }
  return out
}

/** The reminder that covers this post, if any: every time beats this one. */
export function reminderFor(v: ViewerReminders, post: { id: string; seriesId?: string | null }): string | null {
  return (post.seriesId && v.bySeries[post.seriesId]) || v.byPost[post.id] || null
}
