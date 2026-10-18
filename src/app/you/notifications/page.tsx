// #904 (Don, 2026-10-18, option A) — the member's notifications, off until they turn each one on. Only they see it.

import Link from 'next/link'
import { createClient } from '@/lib/supabase-server'
import { AuthCard } from '@/components/shell/AuthCard'
import { Button } from '@/components/ui/Button'
import { NotificationSettings } from '@/components/member/NotificationSettings'
import { saveNotificationPrefsAction, savePushSubscriptionAction } from '@/app/_actions/notification-actions'
import { NOTIFY_COPY as C } from '@/lib/notify/push/copy'
import { DEFAULT_PREFS, type Prefs } from '@/lib/notify/push/rules'

export const dynamic = 'force-dynamic'

export default async function YouNotificationsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return (
      <AuthCard testId="you-notifications-signed-out">
        <h1 className="text-title-1 text-[var(--color-fg)]">{C.title}</h1>
        <p className="mt-2 text-body-sm text-[var(--color-fg-muted)]">{C.signedOut}</p>
        <Button href="/auth/login?next=/you/notifications" className="mt-5 w-full">
          Sign in
        </Button>
      </AuthCard>
    )
  }

  const { data } = await supabase.from('notification_prefs').select('follow_posts, weekend, paused, quiet_start, quiet_end').eq('member_id', user.id).maybeSingle()
  const row = data as { follow_posts: boolean; weekend: boolean; paused: boolean; quiet_start: number; quiet_end: number } | null
  const prefs: Prefs = row
    ? { followPosts: row.follow_posts, weekend: row.weekend, paused: row.paused, quietStart: row.quiet_start, quietEnd: row.quiet_end }
    : DEFAULT_PREFS

  return (
    <main className="mx-auto w-full max-w-read gutter py-6 pb-nav" data-testid="you-notifications">
      <Link href="/you" className="press inline-flex min-h-tap items-center text-body-sm font-medium text-[var(--color-accent)]">
        ← You
      </Link>
      <h1 className="mt-2 text-title-1 md:text-title-1-lg text-[var(--color-fg)]">{C.title}</h1>
      <p className="mt-1 mb-6 text-body-sm text-[var(--color-fg-muted)]">{C.intro}</p>
      <NotificationSettings initial={prefs} save={saveNotificationPrefsAction} subscribe={savePushSubscriptionAction} />
    </main>
  )
}
