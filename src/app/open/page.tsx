// F118 — Help open your town: every town that's next, closest first, and a way to find yours.

import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { OPEN_YOUR_TOWN } from '@/lib/features'
import { cachedBoard } from '@/lib/open/board'
import { placesLeft, ROUND_SIZE } from '@/lib/open/towns'
import { GoalBar } from '@/components/open/GoalBar'
import { TownFinder } from '@/components/open/TownFinder'
import { RoundBanner } from '@/components/open/RoundBanner'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Help open your town — SocialUs',
  description: 'A town opens on SocialUs when 100 makers and 1,000 neighbours sign up. The first 3 to get there open.',
}

export default async function OpenPage() {
  if (!OPEN_YOUR_TOWN) notFound()
  const towns = await cachedBoard()
  return (
    <main className="mx-auto w-full max-w-read gutter py-6 pb-nav" data-testid="open-page">
      <h1 className="text-title-1 md:text-title-1-lg text-[var(--color-fg)]">Help open your town</h1>
      <p className="mt-2 text-body text-[var(--color-fg-muted)]">
        SocialUs is open in Sacramento. These towns are next. A town opens when 100 makers and 1,000 neighbours sign up.
      </p>
      <RoundBanner left={placesLeft(towns)} size={ROUND_SIZE} />
      <TownFinder towns={towns} />
      <ul className="mt-6 divide-y divide-[var(--color-border)] border-y border-[var(--color-border)]" data-testid="town-list">
        {towns.map((t) => (
          <li key={t.slug}>
            <Link href={`/open/${t.slug}`} className="block py-4 hover:no-underline">
              <span className="text-title-3 text-[var(--color-fg)]">{t.name}</span>
              {t.ready_rank && <span className="ml-2 text-body-sm text-[var(--color-highlight-text)]">Ready to open</span>}
              <div className="mt-2 space-y-2">
                <GoalBar label="Makers" have={t.makers} goal={t.maker_goal} compact />
                <GoalBar label="Supporters" have={t.supporters} goal={t.supporter_goal} compact />
              </div>
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-body-sm text-[var(--color-fg-muted)]">
        Not on the list? <Link href="/auth/login?next=/open" className="text-[var(--color-accent-text)] underline">Sign up</Link> and we’ll tell you when your town opens.
      </p>
    </main>
  )
}
