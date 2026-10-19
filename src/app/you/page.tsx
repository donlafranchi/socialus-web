// #303 — L21 You (Don, 2026-10-01): private, for managing your own things —
// the Pages you manage, the Pages you follow, your name and area. Nobody else
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
import { YouNotices, type Notice } from '@/components/member/YouNotices'
import { answerNoticeAction } from '@/app/_actions/report-actions'
import { ANSWER_WINDOW_MS } from '@/lib/reports/answer-window'
import { ZipChange } from '@/components/member/ZipChange'
import { changeZipAction } from '@/app/_actions/zip-actions'
import { SearchSharingSwitch } from '@/components/member/SearchSharingSwitch'
import { setSearchSharingAction } from '@/app/_actions/search-demand-actions'
import { NOTIFY_COPY } from '@/lib/notify/push/copy'
import { YouInterests } from '@/components/member/YouInterests'
import { setInterestAction } from '@/app/_actions/interest-actions'

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

  const [{ data: me }, { data: notices }, { data: interests }] = await Promise.all([
    supabase.from('members').select('display_name, zip, home_market_key, search_sharing').eq('id', user.id).maybeSingle(),
    supabase.from('member_notices').select('id, message, created_at, kind, subject_kind, page:groups(public_id), report_answers(kind)').order('created_at', { ascending: false }).limit(10),
    // #892 — owner-only RLS: only ever this member's own.
    supabase.from('member_interests').select('tag').eq('member_id', user.id),
  ])
  const row = me as { display_name: string | null; zip: string | null; home_market_key: string | null; search_sharing?: boolean | null } | null
  // #568: the area the zip decided, in plain words; the home town stays in the database.
  const area = row?.home_market_key ? ((await supabase.rpc('market_name', { p_key: row.home_market_key })).data as string | null) : null
  const name = row?.display_name ?? null

  return (
    <main className="mx-auto w-full max-w-read gutter py-6 pb-nav" data-testid="you-page">
      <header>
        <h1 className="text-title-1 md:text-title-1-lg text-[var(--color-fg)]">{name || 'You'}</h1>
        <p className="mt-0.5 text-body-sm text-[var(--color-fg-muted)]">{user.email}</p>
        <p className="mt-1 text-caption text-[var(--color-fg-muted)]">Only you see this page.</p>
      </header>

      <YouNotices notices={toNotices(notices)} onAnswer={answerNoticeAction} />

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

      {/* #892 — draft copy ([public-is-draft]). */}
      <Section title="Your interests" testId="interests-section" id="interests">
        <p className="mb-3 text-body-sm text-[var(--color-fg-muted)]">
          Only you see these. In Explore, choose My interests under Filters to see just these.
        </p>
        <YouInterests chosen={((interests ?? []) as { tag: string }[]).map((r) => r.tag)} onSet={setInterestAction} />
      </Section>

      <Section title="Settings" testId="settings-panel">
        <ul className="divide-y divide-[var(--color-border)] rounded-lg border border-[var(--color-border)]">
          <Row label="Name" value={name ?? 'Not set'} testId="settings-name" />
          <Row label="Zip" testId="settings-zip">
            <ZipChange zip={row?.zip ?? null} area={area} change={changeZipAction} />
          </Row>
          <Row label="Email" value={user.email ?? ''} testId="settings-email" />
          {/* #909 — F113 option C: on by default, easy to turn off. */}
          <Row label="Searches" testId="settings-searches">
            <SearchSharingSwitch on={row?.search_sharing !== false} change={setSearchSharingAction} />
          </Row>
          <Row
            label={NOTIFY_COPY.rowLabel}
            value={NOTIFY_COPY.rowValue}
            testId="settings-notifications"
            wrap
            action={<Link href="/you/notifications" className={LINK}>{NOTIFY_COPY.rowAction}</Link>}
          />
          <Row
            label="Help"
            value="Something not working?"
            testId="settings-report"
            wrap
            action={<Link href="/report?from=%2Fyou" className={LINK}>Report a problem with the app</Link>}
          />
          <Row
            label="Rules"
            value="What every Page agrees to"
            testId="settings-rules"
            wrap
            action={<Link href="/rules" className={LINK}>Read</Link>}
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

function Section({ title, testId, id, action, children }: { title: string; testId: string; id?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="mt-8 scroll-mt-20" data-testid={testId} id={id}>
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


type NoticeRow = {
  id: string
  message: string
  created_at: string
  kind: 'content_hidden' | 'courtesy'
  subject_kind: 'group' | 'post'
  page: { public_id: string } | { public_id: string }[] | null
  report_answers: { kind: Notice['answer'] & string } | { kind: Notice['answer'] & string }[] | null
}

function toNotices(rows: unknown): Notice[] {
  return ((rows ?? []) as NoticeRow[]).map((n) => {
    const a = Array.isArray(n.report_answers) ? n.report_answers[0] : n.report_answers
    return {
      id: n.id,
      message: n.message,
      createdAt: n.created_at,
      kind: n.kind,
      subjectKind: n.subject_kind,
      pageHandle: (Array.isArray(n.page) ? n.page[0] : n.page)?.public_id ?? null,
      answer: a?.kind ?? null,
      closed: Date.now() - new Date(n.created_at).getTime() > ANSWER_WINDOW_MS,
    }
  })
}
