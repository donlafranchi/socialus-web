// #1171 (socialus-plan #269, Don 2026-11-02) — Saved, on You: the posts a member kept for later. Only they see it.

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import { loadSavedPosts } from '@/lib/hearts/saved-posts'
import { loadViewerReminders } from '@/lib/reminders/viewer-reminders'
import { SavedList } from '@/components/hearts/SavedList'
import { setSaveAction } from '@/app/_actions/heart-save-actions'
import { setReminderAction, removeReminderAction } from '@/app/_actions/reminder-actions'
import { HEART_COPY } from '@/lib/copy'

export const metadata = { title: 'Saved — SocialUs' }

export const dynamic = 'force-dynamic'

export default async function SavedPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login?next=/you/saved')
  const [posts, reminders] = await Promise.all([loadSavedPosts(supabase), loadViewerReminders(supabase, true)])
  return (
    <main className="mx-auto w-full max-w-read gutter py-6 pb-dock" data-testid="saved-page">
      <h1 className="text-title-1 md:text-title-1-lg text-[var(--color-fg)]">{HEART_COPY.savedTitle}</h1>
      <p className="mt-1 text-caption text-[var(--color-fg-muted)]">Only you see this.</p>
      <div className="mt-4">
        <SavedList posts={posts} reminders={reminders} remind={{ set: setReminderAction, remove: removeReminderAction }} unsave={setSaveAction} />
      </div>
    </main>
  )
}
