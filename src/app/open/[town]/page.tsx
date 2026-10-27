// F118 — one town's page: two bars, what's here so far, the people opening it, and how to help.

import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { OPEN_YOUR_TOWN } from '@/lib/features'
import { createClient } from '@/lib/supabase-server'
import { getPool } from '@/actions/_lib/db'
import { cachedBoard, cachedContributors } from '@/lib/open/board'
import { KIND_LABELS, MAKER_KINDS, placesLeft, ROUND_SIZE } from '@/lib/open/towns'
import { GoalBar } from '@/components/open/GoalBar'
import { RoundBanner } from '@/components/open/RoundBanner'
import { AddMaker } from '@/components/open/AddMaker'
import { InviteButton } from '@/components/open/InviteButton'
import { CreditToggle } from '@/components/open/CreditToggle'
import { Button } from '@/components/ui/Button'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ town: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { town } = await params
  const t = (await cachedBoard()).find((r) => r.slug === town)
  return t ? { title: `Help open ${t.name} — SocialUs`, description: `${t.makers} of ${t.maker_goal} makers and ${t.supporters} of ${t.supporter_goal} supporters so far.` } : {}
}

const inList = (names: string[]) =>
  names.length <= 4 ? names.join(', ') : `${names.slice(0, 4).join(', ')} and ${names.length - 4} more`

interface Mine {
  counted: boolean
  hidden: boolean
  adds: { name: string; public_id: string; claimed: boolean }[]
}

async function mine(memberId: string, slug: string): Promise<Mine> {
  const pool = getPool()
  const [me, adds] = await Promise.all([
    pool.query<{ counted: boolean; open_credit_hidden: boolean }>(
      `select m.home_market_key = t.market_key as counted, m.open_credit_hidden from public.members m, public.towns t where m.id = $1 and t.slug = $2`,
      [memberId, slug],
    ),
    pool.query<{ name: string; public_id: string; claimed: boolean }>(
      `select g.name, g.public_id, g.claimed_at is not null as claimed from public.town_adds a join public.groups g on g.id = a.group_id
        where a.member_id = $1 and a.town_slug = $2 and g.unclaimed_hidden_at is null order by a.created_at desc limit 50`,
      [memberId, slug],
    ),
  ])
  return { counted: !!me.rows[0]?.counted, hidden: !!me.rows[0]?.open_credit_hidden, adds: adds.rows }
}

export default async function TownPage({ params }: Props) {
  if (!OPEN_YOUR_TOWN) notFound()
  const { town } = await params
  const board = await cachedBoard()
  const t = board.find((r) => r.slug === town)
  if (!t) notFound()

  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  const me = data.user ? await mine(data.user.id, t.slug) : null
  const people = await cachedContributors(t.slug)
  const here = `/open/${t.slug}`

  return (
    <main className="mx-auto w-full max-w-read gutter py-6 pb-dock" data-testid="town-page">
      <Link href="/open" className="text-body-sm text-[var(--color-accent-text)]">All towns</Link>
      <h1 className="mt-2 text-title-1 md:text-title-1-lg text-[var(--color-fg)]">Help open {t.name}</h1>
      {t.place_names.length > 0 && <p className="mt-1 text-body-sm text-[var(--color-fg-muted)]">{inList(t.place_names)}</p>}

      {t.ready_rank ? (
        <p className="mt-4 rounded-lg bg-[var(--color-highlight-tint)] px-4 py-3 text-body-sm text-[var(--color-fg)]">{t.name} reached both goals. It opens soon, and everyone here hears first.</p>
      ) : (
        <RoundBanner left={placesLeft(board)} size={ROUND_SIZE} />
      )}

      <section className="mt-6 space-y-5" aria-label="Goals">
        <GoalBar label="Makers" have={t.makers} goal={t.maker_goal} />
        <GoalBar label="Supporters" have={t.supporters} goal={t.supporter_goal} />
      </section>
      <p className="mt-3 text-body-sm text-[var(--color-fg-muted)]">Makers are businesses, makers and organizers with a Page here. Supporters are neighbours who signed up. Counts update every hour.</p>

      <section className="mt-6">
        {!me ? (
          <>
            <Button href={`/auth/login?next=${encodeURIComponent(here)}`} className="w-full">Count me in</Button>
            <p className="mt-2 text-body-sm text-[var(--color-fg-muted)]">Sign up with your email. Your zip puts you in your town.</p>
          </>
        ) : me.counted ? (
          <p className="text-body font-semibold text-[var(--color-fg)]" data-testid="counted">You’re counted here.</p>
        ) : (
          <p className="text-body-sm text-[var(--color-fg-muted)]">You’re counted in the town your zip is in. You can still add makers here.</p>
        )}
        <div className="mt-3">
          <InviteButton label="Invite neighbours" title={`Help open ${t.name} on SocialUs`} text={`Help open ${t.name} on SocialUs:`} path={here} />
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-title-2 text-[var(--color-fg)]">Add a maker you love</h2>
        <p className="mt-1 mb-4 text-body-sm text-[var(--color-fg-muted)]">A bakery, a shop, a maker, a run club. We make them a free Page; you send them the link to claim it.</p>
        {me ? (
          <AddMaker townSlug={t.slug} townName={t.name} places={t.place_names} />
        ) : (
          <Link href={`/auth/login?next=${encodeURIComponent(here)}`} className="text-body text-[var(--color-accent-text)] underline">Sign in to add a maker</Link>
        )}
      </section>

      {me && me.adds.length > 0 && (
        <section className="mt-8" data-testid="my-makers">
          <h2 className="text-title-3 text-[var(--color-fg)]">Makers you added</h2>
          <ul className="mt-2 divide-y divide-[var(--color-border)]">
            {me.adds.map((a) => (
              <li key={a.public_id} className="flex items-center justify-between gap-3 py-3">
                <Link href={`/g/${a.public_id}`} className="min-w-0 truncate text-body text-[var(--color-fg)]">{a.name}</Link>
                <span className="shrink-0 text-body-sm text-[var(--color-fg-muted)]">{a.claimed ? 'Claimed' : 'Not claimed yet'}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-8">
        <h2 className="text-title-3 text-[var(--color-fg)]">Here so far</h2>
        <dl className="mt-2 divide-y divide-[var(--color-border)]" data-testid="maker-kinds">
          {MAKER_KINDS.map((k) => (
            <div key={k} className="flex justify-between py-2 text-body">
              <dt className="text-[var(--color-fg)]">{KIND_LABELS[k]}</dt>
              <dd className="text-[var(--color-fg-muted)]">{t.kinds[k] ?? 0}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="mt-8" data-testid="contributors">
        <h2 className="text-title-3 text-[var(--color-fg)]">People opening {t.name}</h2>
        {people.length === 0 ? (
          <p className="mt-2 text-body-sm text-[var(--color-fg-muted)]">Add the first maker and your name goes here.</p>
        ) : (
          <ol className="mt-2 divide-y divide-[var(--color-border)]">
            {people.map((p, i) => (
              <li key={i} className="flex justify-between py-2 text-body">
                <span className="text-[var(--color-fg)]">{p.first_name}</span>
                <span className="text-body-sm text-[var(--color-fg-muted)]">{p.brought > 0 ? `${p.brought} brought in` : `${p.added} added`}</span>
              </li>
            ))}
          </ol>
        )}
        {me && <CreditToggle townSlug={t.slug} hidden={me.hidden} />}
      </section>
    </main>
  )
}
