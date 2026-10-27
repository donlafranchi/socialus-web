// `/` is the signed-out front door (2026-10-26). A signed-in member never sees
// it: the proxy sends them to Explore, so this page reads no session and stays
// static. Look: Don's "way out" direction — warm limestone, terracotta, olive,
// charcoal; a serif voice; open space; nothing laid over the art.

import Link from 'next/link'
import { Fraunces } from 'next/font/google'
import { Button } from '@/components/ui/Button'
import { CONSENT_LINE, HERO_ART, HOME, HOME_TODO, JOIN_HREF } from '@/lib/home-landing'

const serif = Fraunces({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-serif', display: 'swap' })

const CTA = { href: JOIN_HREF, label: HOME_TODO.primaryCta }
const ART = HERO_ART ?? { src: '/home/hero-placeholder.svg', alt: '' }
const SERIF = 'font-serif font-normal tracking-tight'

export default function HomeLanding() {
  return (
    <div className={`landing ${serif.variable} min-h-full`}>
      <header>
        <nav aria-label="Primary" className="mx-auto flex w-full max-w-shell items-center gap-8 gutter h-nav-top md:px-10">
          <Link href="/" className={`${SERIF} text-title-1 text-[var(--color-ink)]`}>
            SocialUs
          </Link>
          <ul className="hidden flex-1 items-center gap-8 md:flex">
            {HOME.nav.links.map((l) => (
              <li key={l.href}>
                <a href={l.href} className="text-body-sm text-[var(--color-ink)] underline-offset-4 hover:underline">
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
          <Button href={CTA.href} size="sm" className="ml-auto md:ml-0">
            {CTA.label}
          </Button>
        </nav>
      </header>

      <main>
        <section className="mx-auto grid w-full max-w-shell items-center gap-10 gutter pt-10 pb-16 md:px-10 lg:grid-cols-12 lg:gap-12 lg:pt-16 lg:pb-24">
          <div className="lg:col-span-6">
            <h1 className={`${SERIF} text-hero lg:text-hero-lg text-[var(--color-ink)]`}>
              {HOME.hero.lines[0]}
              <br />
              {HOME.hero.lines[1]}
            </h1>
            {HOME.hero.body.map((p) => (
              <p key={p} className="mt-6 max-w-read text-lede text-[var(--color-ink-muted)]">
                {p}
              </p>
            ))}
            <div className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-4">
              <Button href={CTA.href}>{CTA.label}</Button>
              <a href="#what-you-can-do" className="inline-flex min-h-tap items-center text-body-sm font-semibold text-[var(--color-ink)] underline underline-offset-4">
                {HOME.hero.secondary}
              </a>
            </div>
            <p className="mt-8 text-body-sm text-[var(--color-olive)]">{HOME.hero.launch}</p>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element -- a static SVG; next/image adds nothing here */}
          <img src={ART.src} alt={ART.alt} width={1260} height={830} className="h-auto w-full rounded-lg lg:col-span-6" />
        </section>

        <section id="what-you-can-do" aria-labelledby="what-you-can-do-title" className="scroll-mt-4 bg-[var(--color-stone)]">
          <div className="mx-auto w-full max-w-detail gutter py-16 md:py-24">
            <h2 id="what-you-can-do-title" className="sr-only">
              {HOME.hero.secondary}
            </h2>
            <ul className="grid gap-12 md:grid-cols-3 md:gap-10">
              {HOME.can.map((c) => (
                <li key={c.id} id={c.id} className="scroll-mt-4 border-t border-[var(--color-ink)] pt-6">
                  <h3 className={`${SERIF} text-section text-[var(--color-ink)]`}>{c.title}</h3>
                  <p className="mt-4 text-body text-[var(--color-ink-muted)]">{c.body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="why" className="on-ink scroll-mt-4 bg-[var(--color-ink)]">
          <div className="mx-auto w-full max-w-read gutter py-20 md:py-28">
            <h2 className={`${SERIF} text-section md:text-section-lg text-[var(--color-paper)]`}>{HOME.why.title}</h2>
            {HOME.why.body.map((p) => (
              <p key={p} className="mt-6 text-lede text-[var(--color-ink-soft)]">
                {p}
              </p>
            ))}
          </div>
        </section>

        <section className="mx-auto grid w-full max-w-detail gap-8 gutter py-20 md:grid-cols-12 md:py-28">
          <h2 className={`${SERIF} text-section md:text-section-lg text-[var(--color-ink)] md:col-span-5`}>{HOME.thirdSpaces.title}</h2>
          <div className="md:col-span-7">
            {HOME.thirdSpaces.body.map((p, i) => (
              <p key={p} className={`${i ? 'mt-6' : ''} text-lede text-[var(--color-ink-muted)]`}>
                {p}
              </p>
            ))}
          </div>
        </section>

        <section id="join" className="scroll-mt-4 bg-[var(--color-stone)]">
          <div className="mx-auto w-full max-w-read gutter py-20 text-center md:py-28">
            <h2 className={`${SERIF} text-section md:text-section-lg text-[var(--color-ink)]`}>{HOME.launch.title}</h2>
            {HOME.launch.body.map((p) => (
              <p key={p} className="mt-6 text-lede text-[var(--color-ink)]">
                {p}
              </p>
            ))}
            <p className="mx-auto mt-4 max-w-form text-body text-[var(--color-ink-muted)]">{HOME.launch.outOfMarket}</p>
            <div className="mt-10">
              <Button href={CTA.href}>{CTA.label}</Button>
            </div>
            {CONSENT_LINE && <p className="mt-4 text-body-sm text-[var(--color-ink-muted)]">{CONSENT_LINE}</p>}
          </div>
        </section>
      </main>

      <footer>
        <div className="mx-auto flex w-full max-w-shell flex-col gap-4 gutter py-10 md:flex-row md:items-center md:justify-between md:px-10">
          <div>
            <p className={`${SERIF} text-title-1 text-[var(--color-ink)]`}>SocialUs</p>
            <p className="mt-1 text-body-sm text-[var(--color-ink-muted)]">{HOME.footer.line}</p>
          </div>
          <ul className="flex flex-wrap gap-x-2 -mx-2">
            {HOME.footer.links.map((l) => (
              <li key={l.label}>
                {l.href ? (
                  <Link href={l.href} prefetch={false} className="inline-flex min-h-tap items-center px-2 text-body-sm text-[var(--color-ink-muted)] underline underline-offset-4 hover:text-[var(--color-ink)]">
                    {l.label}
                  </Link>
                ) : (
                  <span className="inline-flex min-h-tap items-center px-2 text-body-sm text-[var(--color-ink-muted)]">{l.label}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      </footer>
    </div>
  )
}
