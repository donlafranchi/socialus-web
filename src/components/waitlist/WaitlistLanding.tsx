// #1298 — the waitlist landing (storyboard screen 1): the headline, one line, Join the waitlist and Look around,
// in the front page's terracotta and Aime look. Folded in from #1272: the one line, Look around → Explore, the look.
// While SocialUs stays closed, Join goes to the waitlist, never to sign-up (F076, 2026-11-13).

import Link from 'next/link'
import { ART } from '@/lib/home-landing'
import { href, LANDING, LANDING_HEADLINE } from '@/lib/waitlist/journey'
import { HEAD, PRIMARY, SECONDARY, WRAP } from '@/components/landing/landing-shared'

export function WaitlistLanding() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-[var(--color-rule)]">
        <nav aria-label="Primary" className={`${WRAP} flex items-center py-4`}>
          <Link href="/" className={`${HEAD} text-title-1 text-[var(--color-ink)]`}>
            SocialUs
          </Link>
          <Link href={href('local')} className={`${PRIMARY} ml-auto`}>
            {LANDING.join}
          </Link>
        </nav>
      </header>
      <main className="flex-1">
        <section className={`${WRAP} flex flex-col-reverse items-center gap-10 py-12 text-center md:flex-row md:gap-12 md:py-16 md:text-left`}>
          {/* eslint-disable-next-line @next/next/no-img-element -- pre-sized webp set; the copywriter's picture replaces it (image slot) */}
          <img
            src={ART.hero.src}
            srcSet={ART.hero.srcSet}
            sizes="(min-width: 768px) 50vw, 100vw"
            alt={ART.hero.alt}
            width={ART.hero.width}
            height={ART.hero.height}
            data-image-slot={LANDING.image}
            fetchPriority="high"
            className="h-auto w-full rounded-xs md:flex-1"
          />
          <div className="md:flex-1">
            <h1 data-testid="landing-headline" className={`${HEAD} text-hero lg:text-hero-lg text-[var(--color-ink)]`}>
              {LANDING_HEADLINE}
            </h1>
            <p className="mx-auto mt-6 max-w-read text-lede text-[var(--color-ink-muted)] md:mx-0">{LANDING.line}</p>
            <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-center md:justify-start">
              <Link href={href('local')} className={PRIMARY}>
                {LANDING.join}
              </Link>
              <Link href={LANDING.lookHref} className={SECONDARY}>
                {LANDING.look}
              </Link>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}
