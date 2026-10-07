// #303 — L21 You (Don, 2026-10-01): private, for managing your own things —
// the Pages you manage, the Pages you follow, your name and metro. Nobody else
// can reach it; there is no public member profile (/m/[handle] is retired).
// T4 Manage list page: one 720 column of sections, rows with their action on
// the right; settings as read-only rows until there's a screen to change them.

import Link from 'next/link'
import type { ReactNode } from 'react'
import { createClient } from '@/lib/supabase-server'
import { OwnPages } from '@/components/member/OwnPages'
import { FollowingSummary } from '@/components/follows/FollowingSummary'
import { SignOutButton } from '@/components/auth/SignOutButton'
import { AuthCard } from '@/components/shell/AuthCard'
import { Button } from '@/components/ui/Button'
import { DefaultMetro } from '@/components/member/DefaultMetro'
import { listFeedMetros, splitByOpen } from '@/lib/feed/feed-metro'
import { saveDefaultMetroAction } from '@/app/explore/actions'

export const dynamic = 'force-dynamic'

export default async function YouPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    // Copy is a placeholder ([public-is-draft]).
    return (
      <AuthCard testId="you-signed-out">
        <h1 className="text-title-1 text-[var(--color-fg)]">You</h1>
        <p className="mt-2 text-body-sm text-[var(--color-fg-muted)]">Sign in to see your Pages and the Pages you follow.</p>
        <Button href="/auth/login?next=/you" className="mt-5 w-full">
          Sign in
        </Button>
      </AuthCard>
    )
  }

  const [{ data: me }, metros] = await Promise.all([
    supabase.from('members').select('display_name, default_metro_id, home_metro_id').eq('id', user.id).maybeSingle(),
    listFeedMetros(supabase).catch(() => []),
  ])
  const row = me as { display_name: string | null; default_metro_id: string | null; home_metro_id: string | null } | null
  const name = row?.display_name ?? null
  const openMetros = splitByOpen(metros).open

  return (
    <main className="mx-auto w-full max-w-read gutter py-6 pb-nav" data-testid="you-page">
      <header>
        <h1 className="text-title-1 md:text-title-1-lg text-[var(--color-fg)]">{name || 'You'}</h1>
        <p className="mt-0.5 text-body-sm text-[var(--color-fg-muted)]">{user.email}</p>
        <p className="mt-1 text-caption text-[var(--color-fg-muted)]">Only you see this page.</p>
      </header>

      <Section title="Your Pages" testId="your-pages-section" action={<Link href="/create" className={LINK}>Start something</Link>}>
        <OwnPages memberId={user.id} />
      </Section>

      <FollowingSummary
        memberId={user.id}
        empty={
          <Section title="Following" testId="following-empty-section" action={<Link href="/explore" className={LINK}>Explore</Link>}>
            <p className="text-body-sm text-[var(--color-fg-muted)]" data-testid="you-followed-empty">
              Nothing followed yet.
            </p>
          </Section>
        }
      />

      <Section title="Settings" testId="settings-panel">
        <ul className="divide-y divide-[var(--color-border)] rounded-lg border border-[var(--color-border)]">
          <Row label="Name" value={name ?? 'Not set'} testId="settings-name" />
          <Row label="Metro" testId="settings-metro">
            <DefaultMetro
              metros={openMetros}
              currentId={row?.default_metro_id ?? row?.home_metro_id ?? null}
              onSave={saveDefaultMetroAction}
            />
          </Row>
          <Row label="Email" value={user.email ?? ''} testId="settings-email" />
          <Row
            label="Password"
            value="Sign in without an email"
            testId="settings-password"
            wrap
            action={<Link href="/you/password" className={LINK}>Set or change</Link>}
          />
        </ul>
        <div className="mt-4">
          <SignOutButton />
        </div>
      </Section>
    </main>
  )
}

const LINK = 'press inline-flex min-h-tap items-center text-body-sm font-medium text-[var(--color-accent)]'

function Section({ title, testId, action, children }: { title: string; testId: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="mt-8" data-testid={testId}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-title-3 text-[var(--color-fg)]">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

function Row({ label, value, testId, action, wrap, children }: { label: string; value?: string; testId: string; action?: ReactNode; wrap?: boolean; children?: ReactNode }) {
  return (
    <li className="flex min-h-tap items-center gap-3 px-4 py-2" data-testid={testId}>
      <span className="w-20 shrink-0 text-body-sm text-[var(--color-fg-muted)]">{label}</span>
      {children ?? <span className={`min-w-0 flex-1 text-body-sm text-[var(--color-fg)] ${wrap ? '' : 'truncate'}`}>{value}</span>}
      {action}
    </li>
  )
}
