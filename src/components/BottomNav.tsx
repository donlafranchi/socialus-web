'use client'

import { Fragment } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { NavYouBadge } from './NavYouBadge'
import { PersonMark } from './PersonMark'
import { useAuth } from '@/hooks/useAuth'
import { Home, Search, User, Plus } from 'lucide-react'
import { useNavVisible } from './NavVisibilityProvider'

const TABS = [
  { href: '/explore', label: 'Explore', icon: Search, match: (p: string) => p.startsWith('/explore') || p === '/map' },
  { href: '/you', label: 'You', icon: User, match: (p: string) => p.startsWith('/you') || p.startsWith('/following') },
]

// T158 — create is first class: a persistent action in the nav rather than a
// button buried on You.
//
// It is deliberately NOT a fourth tab. The three tabs are sections of the app
// you can be *in*; create is a thing you *do*, and it lands on a destination
// that is one of those sections. Announcing it as a tab would tell a screen
// reader the nav has four sections when it has three, and would leave a tab
// that can never carry `aria-current` sitting among three that can.
//
// No ARIA tab roles anywhere in this bar, deliberately: `role="tab"` is only
// valid inside a `tablist`, and a nav of links is the correct pattern for
// navigation. What separates the create action from a tab is that it never
// carries `aria-current` and never carries `data-active` — the two things a
// tab uses to say "you are here".
//
// Geometry matches a tab; state never does. It takes the same height, icon and
// type scale so the row reads as one row — but it has no active treatment,
// because there is no sense in which you are "on" it.
//
// Where it points is not this component's decision to make. `/you/sell` is the
// existing create entry; F060 may move it. What the `+` opens — a sheet or a
// page — is a ratified-as-open question and is deliberately unanswered here.
// #274 — not /you/sell: that sends anyone without a business Page back to
// /you, whose empty state said "Tap Create". /you?create=1 opens the flow.
const CREATE = { href: '/you?create=1', label: 'Create' }

// Between the tabs, not at an end. Three tabs give two interior slots; this is
// the one that keeps You last, which is the order members already have.
// Create sits BETWEEN the destinations, not at an end — that placement is the
// bet about declaring things being first class. With Home paused there are two
// tabs, so it moves from after the second to after the first; leaving it at 2
// parks it on the right-hand end, which is a different claim.
const CREATE_AFTER = 1

// #296 — no nav on sign-in, onboarding or admin: each is a flow or a tool, and
// the nav is a way out of the thing you are meant to finish.
const NO_NAV = [/^\/auth(\/|$)/, /^\/onboarding(\/|$)/, /^\/admin(\/|$)/]
export const navHidden = (pathname: string | null) => NO_NAV.some((r) => r.test(pathname ?? '/'))

/** F086 — on a phone the nav has no room for a name, so the You tab carries
 *  the mark instead. One glance, no tap. The name and the sign-out control
 *  live one tap away on /you, which is where this tab goes. */
function YouTabIcon({ active, fallback: Fallback }: { active: boolean; fallback: typeof User }) {
  const { user, loading } = useAuth()
  if (loading || !user) return <Fallback size={20} strokeWidth={1.5} fill={active ? 'currentColor' : 'none'} />
  return <PersonMark name={user.email ?? 'You'} className="h-5 w-5" />
}

export function BottomNav() {
  const pathname = usePathname()
  const router = useRouter()
  const navVisible = useNavVisible()

  if (navHidden(pathname)) return null

  const handleClick = (href: string, isActive: boolean) => (e: React.MouseEvent) => {
    if (isActive) {
      e.preventDefault()
      if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' })
    } else {
      router.push(href)
      e.preventDefault()
    }
  }

  return (
    <nav
      data-testid="bottom-nav"
      aria-label="Primary"
      data-nav-visible={navVisible ? 'true' : 'false'}
      className={`fixed bottom-0 inset-x-0 z-40 border-t border-[var(--color-nav-border)] bg-white transition-transform duration-200 ease-out will-change-transform focus-within:translate-y-0 motion-reduce:transition-none md:hidden md:translate-y-0 ${
        navVisible ? 'translate-y-0' : 'translate-y-full'
      }`}
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <ul className="mx-auto flex h-nav-bottom w-full max-w-form items-stretch justify-around">
        {TABS.map((t, i) => {
          const active = t.match(pathname ?? '/')
          const Icon = t.icon
          return (
            <Fragment key={t.href}>
              <li className="flex flex-1 items-stretch">
                <Link
                  href={t.href}
                  onClick={handleClick(t.href, active)}
                  data-active={active ? 'true' : 'false'}
                  aria-current={active ? 'page' : undefined}
                  className={`flex h-full w-full flex-col items-center justify-center gap-0.5 px-3 text-micro font-medium ${
                    active ? 'text-[var(--color-charcoal)]' : 'text-[var(--color-nav-inactive)]'
                  }`}
                >
                  {t.href === '/you' ? (
                    <YouTabIcon active={active} fallback={Icon} />
                  ) : (
                    <Icon size={20} strokeWidth={1.5} fill={active ? 'currentColor' : 'none'} />
                  )}
                  <span>{t.label}</span>
                </Link>
              </li>
              {i === CREATE_AFTER - 1 && (
                <li className="flex flex-1 items-stretch">
                  <Link
                    href={CREATE.href}
                    data-testid="nav-create"
                    className="flex h-full w-full flex-col items-center justify-center gap-0.5 px-3 text-micro font-medium text-[var(--color-nav-inactive)]"
                  >
                    <Plus size={20} strokeWidth={1.5} />
                    <span>{CREATE.label}</span>
                  </Link>
                </li>
              )}
            </Fragment>
          )
        })}
      </ul>
    </nav>
  )
}

export function TopNavDesktop() {
  const pathname = usePathname()
  if (navHidden(pathname)) return null
  // #296 — 64px, from 744. Explore, then Create; who you are sits at the end.
  return (
    <nav
      data-testid="top-nav-desktop"
      aria-label="Primary"
      className="hidden md:flex sticky top-0 z-40 w-full items-center gap-6 border-b border-neutral-200 bg-white gutter h-nav-top"
    >
      <Link href="/" className="font-semibold text-[var(--color-accent)]">
        SocialUs
      </Link>
      <div className="flex items-center gap-4 text-sm">
        {TABS.map((t, i) => {
          const active = t.match(pathname ?? '/')
          const Icon = t.icon
          return (
            <Fragment key={t.href}>
              <Link
                href={t.href}
                aria-current={active ? 'page' : undefined}
                className={`inline-flex items-center gap-1.5 ${active ? 'text-[var(--color-accent)] font-medium' : 'text-neutral-600 hover:text-neutral-900'}`}
              >
                <Icon size={16} strokeWidth={active ? 2.25 : 1.75} />
                {t.label}
              </Link>
              {/* #296 — the same order as the phone bar: Explore · Create · You. */}
              {i === CREATE_AFTER - 1 && (
                <Link
                  href={CREATE.href}
                  data-testid="desktop-nav-create"
                  className="inline-flex items-center gap-1.5 text-neutral-600 hover:text-neutral-900"
                >
                  <Plus size={16} strokeWidth={1.75} />
                  {CREATE.label}
                </Link>
              )}
            </Fragment>
          )
        })}
      </div>
      <div className="ml-auto">
        {/* F086 — who you are, and the way out. Replaces AuthCtaButtons here,
            which showed "Sign in" when signed out and hid you when signed in,
            so the signed-in state had no representation anywhere in the app.
            AuthCtaButtons is untouched on HomeFeed, its other caller. */}
        <NavYouBadge />
      </div>
    </nav>
  )
}
