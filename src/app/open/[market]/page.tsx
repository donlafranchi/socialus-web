// #1090 — where a market stands on opening (Don, 2026-10-26). Anyone can open
// it, signed out included; a sign-up outside an open market lands here. Counts
// are per market, aggregate only, from the hourly snapshot; no names, ever.
// "Add a business you love", a leaderboard and opening on its own wait for
// after soft launch.

import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { ShareMarketLink } from '@/components/open/ShareMarketLink'
import { openMarketFor } from '@/lib/metro/open-market'
import { OPEN_COPY } from '@/lib/open-market-copy'

export const revalidate = 3600

type Props = { params: Promise<{ market: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const m = await openMarketFor((await params).market)
  return m ? { title: `${m.name} — SocialUs`, description: OPEN_COPY.share(m.name) } : {}
}

function Goal({ label, count, goal }: { label: string; count: number; goal: number }) {
  const pct = Math.min(100, Math.round((count / goal) * 100))
  return (
    <div>
      <div className="flex items-baseline justify-between text-body">
        <span className="font-semibold text-[var(--color-fg)]">{label}</span>
        <span className="text-[var(--color-fg-muted)]">{OPEN_COPY.of(count, goal)}</span>
      </div>
      <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={goal} aria-valuenow={count} className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--color-border)]">
        <div className="h-full bg-[var(--color-accent)]" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

export default async function OpenMarketPage({ params }: Props) {
  const m = await openMarketFor((await params).market)
  if (!m) notFound()

  if (m.open) {
    return (
      <main className="mx-auto w-full max-w-read gutter py-12 pb-nav md:py-16">
        <h1 className="text-title-1-lg text-[var(--color-fg)]">{OPEN_COPY.open(m.name)}</h1>
        <Button href="/auth/login" className="mt-6">
          {OPEN_COPY.join}
        </Button>
      </main>
    )
  }

  return (
    <main className="mx-auto w-full max-w-read gutter py-12 pb-nav md:py-16">
      <h1 className="text-title-1-lg text-[var(--color-fg)]">{OPEN_COPY.notOpen(m.name)}</h1>
      <p className="mt-3 text-body text-[var(--color-fg-muted)]">{OPEN_COPY.notOpenBody}</p>
      <div className="mt-8 flex flex-col gap-6">
        <Goal label={OPEN_COPY.makers} count={m.makers.count} goal={m.makers.goal} />
        <Goal label={OPEN_COPY.supporters} count={m.supporters.count} goal={m.supporters.goal} />
      </div>
      <section className="mt-10 border-t border-[var(--color-border)] pt-6">
        <h2 className="text-title-3 text-[var(--color-fg)]">{OPEN_COPY.share(m.name)}</h2>
        <div className="mt-4">
          <ShareMarketLink title={OPEN_COPY.share(m.name)} />
        </div>
      </section>
    </main>
  )
}
