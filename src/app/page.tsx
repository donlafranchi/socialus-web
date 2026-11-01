// `/` is the signed-out front door (2026-10-26). A signed-in member never sees
// it: the proxy sends them to Explore, so this page reads no session and stays
// static. Look: Don's concept (2026-10-31) — warm off-white, terracotta, sage,
// a dark footer — set in Family Type's Aime, Don's pick (2026-10-31).

import Link from 'next/link'
import { ART, CONSENT_LINE, HOME, HOME_TODO, JOIN_HREF } from '@/lib/home-landing'
import { aime, BTN, CanBlocks, HEAD, HeroHeadline, PRIMARY, SECONDARY, WRAP } from '@/components/landing/landing-shared'

const CTA = { href: JOIN_HREF, label: HOME_TODO.primaryCta }

export default function HomeLanding() {
  return (
    <div className={`landing ${aime.variable} min-h-full font-[family-name:var(--font-landing)] text-body`}>
      <header className="border-b border-[var(--color-rule)]">
        <nav aria-label="Primary" className={`${WRAP} flex items-center gap-8 py-4`}>
          <Link href="/" className={`${HEAD} text-title-1 text-[var(--color-ink)]`}>
            SocialUs
          </Link>
          <ul className="ml-auto hidden items-center gap-6 md:flex">
            {HOME.nav.links.map((l) => (
              <li key={l.href}>
                <a href={l.href} className="inline-flex min-h-tap items-center text-body-sm text-[var(--color-ink)] underline-offset-4 hover:underline">
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
          <Link href={CTA.href} className={`${PRIMARY} ml-auto md:ml-0`}>
            {CTA.label}
          </Link>
        </nav>
      </header>

      <main>
        <section className={`${WRAP} flex flex-col-reverse items-center gap-10 py-12 text-center md:flex-row md:gap-12 md:py-16 md:text-left`}>
          {/* eslint-disable-next-line @next/next/no-img-element -- pre-sized webp set; next/image adds nothing here */}
          <img
            src={ART.hero.src}
            srcSet={ART.hero.srcSet}
            sizes="(min-width: 768px) 50vw, 100vw"
            alt={ART.hero.alt}
            width={ART.hero.width}
            height={ART.hero.height}
            fetchPriority="high"
            className="h-auto w-full rounded-xs md:flex-1"
          />
          <div className="md:flex-1">
            <HeroHeadline />
            {HOME.hero.body.map((p, i) => (
              <p key={p} className={`${i ? 'mt-4 font-semibold text-[var(--color-ink)]' : 'mt-6 text-[var(--color-ink-muted)]'} mx-auto max-w-read text-lede md:mx-0`}>
                {p}
              </p>
            ))}
            <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-center md:justify-start">
              <Link href={CTA.href} className={PRIMARY}>
                {CTA.label}
              </Link>
              <a href="#what-you-can-do" className={SECONDARY}>
                {HOME.hero.secondary}
              </a>
            </div>
            <p className="mt-6 text-body-sm font-semibold text-[var(--color-ink-muted)]">{HOME.hero.launch}</p>
          </div>
        </section>

        <section id="what-you-can-do" aria-labelledby="what-you-can-do-title" className="scroll-mt-4 py-12 md:py-16">
          <div className={WRAP}>
            <h2 id="what-you-can-do-title" className="sr-only">
              {HOME.hero.secondary}
            </h2>
            <CanBlocks />
            {/* eslint-disable-next-line @next/next/no-img-element -- pre-sized webp set; next/image adds nothing here */}
            <img
              src={ART.localBusinesses.src}
              srcSet={ART.localBusinesses.srcSet}
              sizes="(min-width: 1200px) 1100px, 100vw"
              alt={ART.localBusinesses.alt}
              width={ART.localBusinesses.width}
              height={ART.localBusinesses.height}
              loading="lazy"
              className="mt-10 h-auto w-full rounded-xs"
            />
          </div>
        </section>

        <section id="why" className="scroll-mt-4 bg-white py-16 md:py-24">
          <div className={`${WRAP} flex flex-col gap-8 text-center md:flex-row md:gap-16 md:text-left`}>
            <h2 className={`${HEAD} text-section md:text-section-lg text-[var(--color-ink)] md:flex-1`}>{HOME.why.title}</h2>
            <div className="mx-auto max-w-read md:mx-0 md:flex-1">
              {HOME.why.body.map((p, i) => (
                <p key={p} className={`${i ? 'mt-5' : 'font-semibold text-[var(--color-ink)]'} text-lede text-[var(--color-ink-muted)]`}>
                  {p}
                </p>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-[var(--color-sage)] py-16 md:py-24">
          <div className={`${WRAP} flex flex-col items-center gap-10 text-center md:flex-row md:gap-16 md:text-left`}>
            <div className="max-w-read md:flex-1">
              <h2 className={`${HEAD} text-section md:text-section-lg text-[var(--color-ink)]`}>{HOME.thirdSpaces.title}</h2>
              {HOME.thirdSpaces.body.map((p, i) => (
                <p key={p} className={`${i ? 'mt-5' : 'mt-6 font-semibold'} text-lede text-[var(--color-ink)]`}>
                  {p}
                </p>
              ))}
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element -- pre-sized webp set; next/image adds nothing here */}
            <img
              src={ART.thirdSpaces.src}
              srcSet={ART.thirdSpaces.srcSet}
              sizes="(min-width: 768px) 50vw, 100vw"
              alt={ART.thirdSpaces.alt}
              width={ART.thirdSpaces.width}
              height={ART.thirdSpaces.height}
              loading="lazy"
              className="h-auto w-full rounded-xs md:flex-1"
            />
          </div>
        </section>

        <section id="join" className="on-dark scroll-mt-4 bg-[var(--color-clay)] py-16 text-center md:py-24">
          <div className={`${WRAP} max-w-read`}>
            <h2 className={`${HEAD} text-section md:text-section-lg text-[var(--color-paper)]`}>{HOME.launch.title}</h2>
            {HOME.launch.body.map((p) => (
              <p key={p} className="mt-6 text-lede font-semibold text-[var(--color-paper)]">
                {p}
              </p>
            ))}
            <p className="mt-4 text-lede text-[var(--color-paper)]">{HOME.launch.outOfMarket}</p>
            <Link href={CTA.href} className={`${BTN} mt-8 bg-white px-8 text-lede text-[var(--color-clay)] hover:bg-[var(--color-paper)]`}>
              {CTA.label}
            </Link>
            {/* TODO(Don): consent line pending its final wording (see CONSENT_LINE). */}
            {CONSENT_LINE && <p className="mt-4 text-body-sm text-[var(--color-paper)]">{CONSENT_LINE}</p>}
          </div>
        </section>
      </main>

      <footer className="on-dark bg-[var(--color-ink)] py-10 text-[var(--color-paper)]">
        <div className={`${WRAP} flex flex-col gap-8 md:flex-row md:justify-between`}>
          <div>
            <p className={`${HEAD} text-title-1`}>SocialUs</p>
            <p className="mt-1 text-body-sm text-[var(--color-ink-soft)]">{HOME.footer.line}</p>
          </div>
          <div className="flex gap-12">
            <ul>
              {HOME.nav.links.map((l) => (
                <li key={l.href}>
                  <a href={l.href} className="inline-flex min-h-tap items-center text-body-sm text-[var(--color-paper)] underline-offset-4 hover:underline">
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
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
        </div>
      </footer>
    </div>
  )
}
