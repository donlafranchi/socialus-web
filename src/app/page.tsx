// `/` is the signed-out front door (2026-10-26). A signed-in member never sees
// it: the proxy sends them to Explore, so this page reads no session and stays
// static. Home's LocalityFeed is still paused, not deleted (Don, 2026-09-17).

import Link from 'next/link'
import { Button } from '@/components/ui/Button'
import { CONSENT_LINE, HERO_ART, HOME, HOME_TODO, JOIN_HREF } from '@/lib/home-landing'

const CTA = { href: JOIN_HREF, label: HOME_TODO.primaryCta }
const ART = HERO_ART ?? { src: '/home/hero-placeholder.svg', alt: '' }

export default function HomeLanding() {
  return (
    <>
      <header className="border-b border-[var(--color-border)] bg-white">
        <nav aria-label="Primary" className="mx-auto flex w-full max-w-detail items-center gap-6 gutter h-nav-top">
          <Link href="/" className="text-title-3 text-[var(--color-accent)]">
            SocialUs
          </Link>
          <ul className="hidden flex-1 items-center gap-6 md:flex">
            {HOME.nav.links.map((l) => (
              <li key={l.href}>
                <a href={l.href} className="text-body-sm text-[var(--color-fg)] hover:underline">
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
        <section className="bg-[var(--color-surface)]">
          <div className="mx-auto grid w-full max-w-detail items-center gap-10 gutter py-12 md:grid-cols-2 md:py-20">
            <div>
              <h1 className="text-display text-[var(--color-fg)]">
                {HOME.hero.lines[0]}
                <br />
                {HOME.hero.lines[1]}
              </h1>
              {HOME.hero.body.map((p) => (
                <p key={p} className="mt-4 max-w-read text-body md:text-title-2 md:font-normal text-[var(--color-fg-muted)]">
                  {p}
                </p>
              ))}
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Button href={CTA.href}>{CTA.label}</Button>
                <Button href="#what-you-can-do" variant="secondary">
                  {HOME.hero.secondary}
                </Button>
              </div>
              <p className="mt-4 text-body-sm text-[var(--color-fg-muted)]">{HOME.hero.launch}</p>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element -- a static SVG; next/image adds nothing here */}
            <img src={ART.src} alt={ART.alt} width={640} height={480} className="h-auto w-full" />
          </div>
        </section>

        <section id="what-you-can-do" aria-labelledby="what-you-can-do-title" className="mx-auto w-full max-w-detail gutter py-12 md:py-16 scroll-mt-4">
          <h2 id="what-you-can-do-title" className="sr-only">
            {HOME.hero.secondary}
          </h2>
          <ul className="grid gap-8 md:grid-cols-3 md:gap-10">
            {HOME.can.map((c) => (
              <li key={c.id} id={c.id} className="scroll-mt-4 border-t-2 border-[var(--color-highlight-mark)] pt-4">
                <h3 className="text-title-2 text-[var(--color-fg)]">{c.title}</h3>
                <p className="mt-3 text-body text-[var(--color-fg)]">{c.body}</p>
              </li>
            ))}
          </ul>
        </section>

        <section id="why" className="on-frame scroll-mt-4 bg-[var(--color-frame)]">
          <div className="mx-auto w-full max-w-read gutter py-12 md:py-16">
            <h2 className="text-title-1 md:text-title-1-lg text-[var(--color-on-frame)]">{HOME.why.title}</h2>
            {HOME.why.body.map((p) => (
              <p key={p} className="mt-4 text-body text-[var(--color-on-frame)]">
                {p}
              </p>
            ))}
          </div>
        </section>

        <section className="mx-auto w-full max-w-read gutter py-12 md:py-16">
          <h2 className="text-title-1 text-[var(--color-fg)]">{HOME.thirdSpaces.title}</h2>
          {HOME.thirdSpaces.body.map((p) => (
            <p key={p} className="mt-4 text-body text-[var(--color-fg)]">
              {p}
            </p>
          ))}
        </section>

        <section id="join" className="scroll-mt-4 bg-[var(--color-surface)]">
          <div className="mx-auto w-full max-w-read gutter py-12 md:py-16">
            <h2 className="text-title-1 text-[var(--color-fg)]">{HOME.launch.title}</h2>
            {HOME.launch.body.map((p) => (
              <p key={p} className="mt-4 text-body text-[var(--color-fg)]">
                {p}
              </p>
            ))}
            <p className="mt-4 text-body text-[var(--color-fg)]">{HOME.launch.outOfMarket}</p>
            <div className="mt-8">
              <Button href={CTA.href}>{CTA.label}</Button>
            </div>
            {CONSENT_LINE && <p className="mt-4 text-body-sm text-[var(--color-fg-muted)]">{CONSENT_LINE}</p>}
          </div>
        </section>
      </main>

      <footer className="border-t border-[var(--color-border)] bg-white">
        <div className="mx-auto flex w-full max-w-detail flex-col gap-4 gutter py-8 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-title-3 text-[var(--color-fg)]">SocialUs</p>
            <p className="mt-1 text-body-sm text-[var(--color-fg-muted)]">{HOME.footer.line}</p>
          </div>
          <ul className="flex flex-wrap gap-x-2">
            {HOME.footer.links.map((l) => (
              <li key={l.label}>
                {l.href ? (
                  <Link href={l.href} prefetch={false} className="inline-flex min-h-tap items-center px-2 text-body-sm text-[var(--color-fg-muted)] underline hover:text-[var(--color-fg)]">
                    {l.label}
                  </Link>
                ) : (
                  <span className="inline-flex min-h-tap items-center px-2 text-body-sm text-[var(--color-fg-muted)]">{l.label}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      </footer>
    </>
  )
}
