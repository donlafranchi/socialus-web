// T109 / #962 — the Following page. Pages first (Don, 2026-10-19: "Shouldn't I be able to see which businesses I
// follow from within the app?"): every Page the member follows, soonest upcoming post first. People and places
// they follow follow below, from the unified reader (T108); its Groups are the Pages above, so they're left out.

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import { getMemberFollows } from '@/lib/follows/get-member-follows'
import { loadFollowedPages } from '@/lib/follows/followed-pages'
import { FollowingManager } from '@/components/follows/FollowingManager'
import { FollowedPagesList } from '@/components/follows/FollowedPagesList'
import { followPageAction, unfollowPageAction } from '@/app/_actions/page-follow-actions'
import { remindEveryTimeForPageAction } from '@/app/_actions/reminder-actions'

export const metadata = {
  title: 'Following — SocialUs',
}

export const dynamic = 'force-dynamic'

export default async function FollowingPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login?next=/you/following')

  const entries = await getMemberFollows(supabase, user.id)
  const pages = await loadFollowedPages(supabase, entries.filter((e) => e.kind === 'group').map((e) => e.entityId))
  const others = entries.filter((e) => e.kind !== 'group')

  return (
    <main className="mx-auto w-full max-w-read gutter py-6 pb-nav" data-testid="following-page">
      <h1 className="text-title-1 md:text-title-1-lg text-[var(--color-fg)]">Following</h1>
      <section className="mt-4" data-testid="section-pages">
        <h2 className="sr-only">Pages</h2>
        <FollowedPagesList
          pages={pages}
          actions={{ follow: followPageAction, unfollow: unfollowPageAction, everyForPage: remindEveryTimeForPageAction }}
        />
      </section>
      {others.length > 0 && (
        <div className="mt-8">
          <FollowingManager entries={others} groupCounts={{}} />
        </div>
      )}
    </main>
  )
}
