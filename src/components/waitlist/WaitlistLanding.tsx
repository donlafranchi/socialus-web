// #1298 — the landing page, the PM's rewrite (2026-11-13): one column, warm off-white, Aime display headings,
// his terracotta illustrations, two "Join SocialUs" buttons into the waitlist (never sign-up, while closed).

import Link from 'next/link'
import { ART, HOME } from '@/lib/home-landing'
import { href, LANDING, LANDING_HEADLINE } from '@/lib/waitlist/journey'
import { HEAD, WRAP } from '@/components/landing/landing-shared'

const DARK = 'press inline-flex min-h-12 items-center justify-center rounded-xs bg-[var(--color-ink)] px-8 text-body font-semibold text-[var(--color-paper)] hover:no-underline'
const H2 = `${HEAD} text-title-1 md:text-hero text-[var(--color-ink)]`

// [open-question owner=don raised=2026-11-13] Commercial-use rights for the three illustrations (town square, main street, park): they came in with your 2026-10-31 concept (#1134) and no source or licence is recorded. Who made them, and may we use them commercially?
type Art = (typeof ART)[keyof typeof ART]
function Picture({ art, sizes, eager }: { art: Art; sizes: string; eager?: boolean }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- pre-sized webp set; next/image adds nothing here
    <img
      src={art.src}
      srcSet={art.srcSet}
      sizes={sizes}
      alt={art.alt}
      width={art.width}
      height={art.height}
      loading={eager ? 'eager' : 'lazy'}
      fetchPriority={eager ? 'high' : undefined}
      className="h-auto w-full rounded-xs"
    />
  )
}

export function WaitlistLanding() {
  const join = href('local')
  return (
    <div className="flex min-h-dvh flex-col">
      <header>
        <nav aria-label="Primary" className="mx-auto w-full max-w-read gutter py-5 text-center">
          <Link href="/" className={`${HEAD} text-title-1 text-[var(--color-ink)]`}>
            SocialUs
          </Link>
        </nav>
      </header>

      <main className="mx-auto flex w-full max-w-read flex-1 flex-col items-center gap-12 gutter pb-16 text-center">
        <section className="flex flex-col items-center pt-6">
          <h1 data-testid="landing-headline" className={`${HEAD} text-hero lg:text-hero-lg text-[var(--color-ink)]`}>
            {LANDING_HEADLINE}
          </h1>
          <p className="mt-4 max-w-read text-lede text-[var(--color-ink-muted)]">{LANDING.sub}</p>
          <Link href={join} className={`${DARK} mt-8`}>
            {LANDING.join}
          </Link>
        </section>

        <Picture art={ART.hero} sizes="(min-width: 768px) 720px, 100vw" eager />

        <section className="flex w-full flex-col items-center gap-8">
          <h2 className={H2}>{LANDING.meet}</h2>
          <div className="grid w-full gap-6 sm:grid-cols-2">
            <Picture art={ART.localBusinesses} sizes="(min-width: 640px) 360px, 100vw" />
            <Picture art={ART.thirdSpaces} sizes="(min-width: 640px) 360px, 100vw" />
          </div>
        </section>

        <section>
          <h2 className={H2}>{LANDING.know}</h2>
          <p className="mt-3 text-body text-[var(--color-ink-muted)]">{LANDING.support}</p>
        </section>

        <section className="flex flex-col items-center">
          <h2 className={H2}>{LANDING.rest}</h2>
          <Link href={join} className={`${DARK} mt-8`}>
            {LANDING.join}
          </Link>
        </section>
      </main>

      <footer className="on-dark bg-[var(--color-ink)] py-10 text-[var(--color-paper)]">
        <div className={`${WRAP} flex flex-col gap-6 md:flex-row md:justify-between`}>
          <div>
            <p className={`${HEAD} text-title-1`}>SocialUs</p>
            <p className="mt-1 text-body-sm text-[var(--color-ink-soft)]">{HOME.footer.line}</p>
          </div>
          <ul>
            {HOME.footer.links.map((l) => (
              <li key={l.label}>
                <Link href={l.href} prefetch={false} className="inline-flex min-h-tap items-center text-body-sm text-[var(--color-paper)] underline underline-offset-4">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </footer>
    </div>
  )
}
