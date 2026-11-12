// The pitch: one line, Don's sentence under it, one way in (2026-11-06, #1271). Served at `/`
// and at `/join`, so the front door and the shared link say the same thing.

import Link from 'next/link'
import { ART, CONSENT_LINE, HOME, HOME_TODO, JOIN_HREF, MESSAGE } from '@/lib/home-landing'
import { aime, HEAD, Message, PRIMARY, WRAP } from './landing-shared'

const CTA = { href: JOIN_HREF, label: HOME_TODO.primaryCta }

export function Landing() {
  return (
    <div className={`landing ${aime.variable} flex min-h-full flex-col font-[family-name:var(--font-landing)] text-body`}>
      <header className="border-b border-[var(--color-rule)]">
        <nav aria-label="Primary" className={`${WRAP} flex items-center py-4`}>
          <Link href="/" className={`${HEAD} text-title-1 text-[var(--color-ink)]`}>
            SocialUs
          </Link>
          <Link href={CTA.href} className={`${PRIMARY} ml-auto`}>
            {CTA.label}
          </Link>
        </nav>
      </header>

      <main className="flex-1">
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
            <Message />
            <div className="mt-8 flex justify-center md:justify-start">
              <Link href={CTA.href} className={PRIMARY}>
                {CTA.label}
              </Link>
            </div>
            {/* TODO(Don): consent line pending its final wording (see CONSENT_LINE). */}
            {CONSENT_LINE && <p className="mt-4 text-body-sm text-[var(--color-ink-muted)]">{CONSENT_LINE}</p>}
          </div>
        </section>
      </main>

      <footer className="on-dark bg-[var(--color-ink)] py-10 text-[var(--color-paper)]">
        <div className={`${WRAP} flex flex-col gap-8 md:flex-row md:justify-between`}>
          <div>
            <p className={`${HEAD} text-title-1`}>SocialUs</p>
            <p className="mt-1 text-body-sm text-[var(--color-ink-soft)]">{MESSAGE}</p>
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
