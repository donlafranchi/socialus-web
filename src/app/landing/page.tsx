import type { Metadata } from 'next'
import Link from 'next/link'
import { Button } from '@/components/ui/Button'
import { LandingWaitlistForm } from '@/components/landing/LandingWaitlistForm'
import { RotatingLine } from '@/components/landing/RotatingLine'
import { LANDING } from '@/lib/landing-copy'
import { joinLandingWaitlistAction } from './actions'

// A preview for Don (2026-10-08). Not linked from the app, not indexed. `/`
// still redirects to Explore and `/about` is untouched.
export const metadata: Metadata = {
  title: 'SocialUs',
  description: LANDING.subhead,
  robots: { index: false, follow: false },
}

export default function LandingPage() {
  return (
    <main className="pb-nav">
      <section className="bg-[var(--color-surface)]">
        <div className="mx-auto w-full max-w-detail gutter py-12 md:py-20">
          <h1 className="text-title-1-lg md:text-display text-[var(--color-fg)]">{LANDING.headline}</h1>
          <p className="mt-4 max-w-read text-body md:text-title-2 md:font-normal text-[var(--color-fg-muted)]">{LANDING.subhead}</p>
          <ul className="mt-10 grid gap-6 md:grid-cols-3 md:gap-8">
            {LANDING.verbs.map((v) => (
              <li key={v} className="border-t-2 border-[var(--color-highlight-mark)] pt-4 text-title-3 text-[var(--color-fg)]">
                {v}
              </li>
            ))}
          </ul>
          <div className="mt-10 flex flex-col gap-3 sm:flex-row">
            <Button href="#waitlist">{LANDING.ctas.primary}</Button>
            <Button href="/landing/about" variant="secondary">
              {LANDING.ctas.secondary}
            </Button>
          </div>
        </div>
      </section>

      <section className="on-frame bg-[var(--color-frame)]">
        <div className="mx-auto w-full max-w-detail gutter py-10 md:py-14">
          <RotatingLine prefix={LANDING.rotating.prefix} items={LANDING.rotating.items} />
        </div>
      </section>

      <section className="mx-auto w-full max-w-detail gutter py-12 md:py-16">
        <div className="grid gap-8 md:grid-cols-2 md:gap-12">
          {[LANDING.find, LANDING.beFound].map((s) => (
            <div key={s.title}>
              <h2 className="text-title-1 text-[var(--color-fg)]">{s.title}</h2>
              {s.body.map((p) => (
                <p key={p} className="mt-4 text-body text-[var(--color-fg)]">
                  {p}
                </p>
              ))}
            </div>
          ))}
        </div>
      </section>

      <section className="bg-[var(--color-surface)]">
        <div className="mx-auto w-full max-w-read gutter py-12 md:py-16">
          <h2 className="text-title-1 text-[var(--color-fg)]">{LANDING.offline.title}</h2>
          <p className="mt-4 text-body text-[var(--color-fg)]">{LANDING.offline.body}</p>
        </div>
      </section>

      <section className="on-frame bg-[var(--color-frame)]">
        <div className="mx-auto w-full max-w-read gutter py-12 md:py-16">
          <p className="text-title-2 md:text-title-1-lg text-[var(--color-on-frame)]">{LANDING.members.body}</p>
          <Link href="/landing/about" className="mt-4 inline-block text-body font-semibold text-[var(--color-highlight-soft)]">
            {LANDING.members.link}
          </Link>
        </div>
      </section>

      <section id="waitlist" className="mx-auto w-full max-w-detail gutter py-12 md:py-16">
        <div className="mx-auto max-w-form rounded-lg border border-[var(--color-border)] bg-white p-6 md:p-8">
          <h2 className="text-title-1 text-[var(--color-fg)]">{LANDING.waitlist.title}</h2>
          <div className="mt-6">
            <LandingWaitlistForm onSubmit={joinLandingWaitlistAction} />
          </div>
        </div>
      </section>

      <div className="mx-auto flex w-full max-w-detail flex-wrap items-center gap-x-6 gap-y-2 gutter pb-10 text-caption text-[var(--color-fg-muted)]">
        <span>{LANDING.footer.signoff}</span>
        <Link href="/landing/about" className="hover:text-[var(--color-fg)]">
          {LANDING.members.link}
        </Link>
        <Link href="/terms" className="hover:text-[var(--color-fg)]">
          Terms
        </Link>
        <Link href="/privacy" className="hover:text-[var(--color-fg)]">
          Privacy
        </Link>
      </div>
    </main>
  )
}
