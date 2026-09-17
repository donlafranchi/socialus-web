'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import { useMarket } from '@/components/MarketContext'
import { MarketSelector } from '@/components/MarketSelector'
import { SellCta } from '@/components/sell/SellCta'
import { FollowingSummary } from '@/components/follows/FollowingSummary'
import { NavYouBadge } from '@/components/NavYouBadge'
import { OwnPages } from '@/components/member/OwnPages'

type Tab = 'saved' | 'following' | 'settings'

function supabase() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  )
}

export default function YouPage() {
  return (
    <Suspense fallback={<main className="p-4 pb-24">Loading…</main>}>
      <YouPageInner />
    </Suspense>
  )
}

function YouPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const tabParam = (searchParams.get('tab') as Tab) || 'saved'
  const tab: Tab = ['saved', 'following', 'settings'].includes(tabParam) ? tabParam : 'saved'

  const { selectedMarket } = useMarket()
  const [marketSelectorOpen, setMarketSelectorOpen] = useState(false)
  const [email, setEmail] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [emailsEnabled, setEmailsEnabled] = useState(true)

  useEffect(() => {
    const client = supabase()
    client.auth.getUser().then(async ({ data }) => {
      const user = data.user
      if (!user) {
        setLoaded(true)
        return
      }
      setEmail(user.email ?? null)
      setUserId(user.id)

      // Vendors are retired (DECISIONS 2026-09-16). The tables this block used
      // to read — businesses, vendors, follows, vendor_categories, markets,
      // market_vendors, supports — do not exist and never did, so every one of
      // these queries returned nothing and the tabs below rendered empty.
      // What survives is the one preference this page actually stores.
      const { data: prefs } = await client
        .from('user_preferences')
        .select('follow_emails_enabled')
        .eq('user_id', user.id)
        .maybeSingle()

      setEmailsEnabled(prefs?.follow_emails_enabled ?? true)

      setLoaded(true)
    })
  }, [])

  const setTab = (next: Tab) => {
    router.replace(`/you?tab=${next}`, { scroll: false })
  }

  const toggleEmails = async () => {
    if (!userId) return
    const client = supabase()
    const next = !emailsEnabled
    setEmailsEnabled(next)
    await client
      .from('user_preferences')
      .upsert({ user_id: userId, follow_emails_enabled: next, updated_at: new Date().toISOString() })
  }

  const signOut = async () => {
    const client = supabase()
    await client.auth.signOut()
    window.location.href = '/'
  }

  if (!loaded) return <main className="p-4 pb-24">Loading…</main>

  if (!email) {
    return (
      <main className="p-6 pb-24 max-w-md mx-auto text-center">
        <h1 className="text-xl font-semibold">You</h1>
        <p className="mt-3 text-neutral-600 text-sm">Sign in to follow vendors and save your market. We email you a link — no password.</p>
        <div className="mt-4 flex flex-col gap-2">
          <Link href="/auth/login" className="btn-primary">Sign in</Link>
        </div>
        <div className="mt-8 pt-6 border-t border-neutral-200">
          <p className="text-xs uppercase tracking-wider text-neutral-500 font-semibold">Are you a business owner?</p>
          <Link
            href="/join"
            className="mt-3 inline-flex items-center justify-center rounded-full border border-[var(--color-accent)] text-[var(--color-accent)] px-4 py-2 text-sm font-medium hover:bg-[var(--color-accent-tint)]"
          >
            List your business →
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main className="pb-24 max-w-3xl mx-auto p-4" data-testid="you-page">
      {/* F086 (thin front) — on a phone the nav has no room for a name, so the
          badge lives here too. This is the sign-out control's home on mobile:
          the You tab is one tap from anywhere and lands on it. */}
      <div className="mb-4 md:hidden">
        <NavYouBadge />
      </div>
      <header className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold">You</h1>
          <p className="text-sm text-neutral-600 mt-0.5">{email}</p>
        </div>
      </header>

      {/* T073 — Sell CTA (always-visible, 3-branch routing per F036). */}
      <SellCta memberId={userId} />

      {/* The Pages this member made. Nothing showed these before: SellCta finds
          a DRAFT to resume and lets an active Page fall through, so someone who
          had built something had no surface that showed it back to them. */}
      {userId && (
        <section className="mt-6" data-testid="your-pages-section">
          <h2 className="text-[17px] font-semibold text-[var(--color-fg)] mb-3">Your Pages</h2>
          <OwnPages memberId={userId} />
        </section>
      )}

      <section className="mt-4 rounded-xl border border-neutral-200 bg-white px-4 py-3 flex items-center justify-between gap-3" data-testid="your-market-row">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-neutral-500 font-semibold">Your Market</p>
          {selectedMarket ? (
            <p className="text-sm font-medium text-neutral-900 truncate">
              {selectedMarket.name} <span className="text-neutral-500 font-normal">· {selectedMarket.city}</span>
            </p>
          ) : (
            <p className="text-sm text-neutral-500">Not set</p>
          )}
        </div>
        <button
          type="button"
          onClick={() => setMarketSelectorOpen(true)}
          data-testid="change-market"
          className="text-sm font-medium text-[var(--color-accent)] hover:underline"
        >
          Change
        </button>
      </section>

      {/* T108 — F042 unified "Following" summary (card scroll, new-schema follows:
          Members / Groups / Venues). Self-omits when the Member follows nothing. */}
      {userId && <FollowingSummary memberId={userId} />}

      <nav className="mt-6 flex gap-2" role="tablist" data-testid="you-tabs">
        {(['saved', 'following', 'settings'] as Tab[]).map((t) => {
          const active = tab === t
          return (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={active}
              data-testid={`tab-${t}`}
              data-active={active}
              onClick={() => setTab(t)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium capitalize transition-colors ${
                active
                  ? 'bg-[var(--color-accent)] text-white'
                  : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
              }`}
            >
              {t}
            </button>
          )
        })}
      </nav>

      <div className="mt-6">
        {tab === 'saved' && <EmptyTab what="saved" />}
        {tab === 'following' && <EmptyTab what="followed" />}
        {tab === 'settings' && (
          <SettingsTab emailsEnabled={emailsEnabled} onToggleEmails={toggleEmails} onSignOut={signOut} />
        )}
      </div>

      <MarketSelector open={marketSelectorOpen} onClose={() => setMarketSelectorOpen(false)} userLocation={null} />
    </main>
  )
}

// Saved and Following were vendor lists. Vendors are retired (DECISIONS
// 2026-09-16) and the tables behind them never existed, so both tabs have
// always rendered empty. They stay as named places rather than disappearing
// mid-session; what fills them is Pages, and that is its own ticket.
function EmptyTab({ what }: { what: string }) {
  return (
    <p className="text-sm text-neutral-600" data-testid={`you-${what}-empty`}>
      Nothing {what} yet.
    </p>
  )
}

function SettingsTab({
  emailsEnabled,
  onToggleEmails,
  onSignOut,
}: {
  emailsEnabled: boolean
  onToggleEmails: () => void
  onSignOut: () => void
}) {
  return (
    <div className="space-y-4" data-testid="settings-panel">
      <div>
        <h2 className="text-sm font-semibold text-neutral-700 mb-2">Notifications</h2>
        <label className="flex items-center justify-between bg-white border border-neutral-200 rounded-lg px-4 py-3 text-sm">
          <span>Email me when followed vendors are at upcoming markets</span>
          <input type="checkbox" checked={emailsEnabled} onChange={onToggleEmails} className="h-4 w-4" />
        </label>
      </div>
      <button onClick={onSignOut} className="text-sm text-neutral-600 underline">
        Sign out
      </button>
    </div>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="text-center py-10 px-6 border border-dashed border-neutral-300 rounded-xl">
      <p className="text-sm text-neutral-600">{message}</p>
      <Link
        href="/explore"
        className="mt-4 inline-flex items-center justify-center rounded-full bg-[var(--color-accent)] text-white px-4 py-2 text-sm font-medium"
      >
        Explore →
      </Link>
    </div>
  )
}
