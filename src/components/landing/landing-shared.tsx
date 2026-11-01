// The front door's look, shared with the one-time welcome (/welcome): the font, the class
// strings, the hero headline and the "What you can do" blocks, so the two cannot drift apart.

import localFont from 'next/font/local'
import { HOME } from '@/lib/home-landing'

// TODO(Don): these are Family Type's trial files (ASCII only, evaluation licence); swap in the Brand Licence WOFF2s once bought.
export const aime = localFont({
  src: [
    { path: '../../app/fonts/aime-regular.woff2', weight: '400', style: 'normal' },
    { path: '../../app/fonts/aime-semibold.woff2', weight: '600', style: 'normal' },
  ],
  variable: '--font-landing',
  display: 'swap',
})

export const HEAD = 'font-normal tracking-tight'
export const WRAP = 'mx-auto w-full max-w-landing gutter md:px-10'
export const BTN = 'press inline-flex min-h-tap items-center justify-center rounded-xs px-6 text-body font-semibold hover:no-underline'
export const PRIMARY = `${BTN} bg-[var(--color-clay)] text-[var(--color-paper)] hover:bg-[var(--color-clay-deep)]`
export const SECONDARY = `${BTN} border border-[var(--color-ink-muted)] text-[var(--color-ink-muted)] hover:bg-white`

export function HeroHeadline() {
  return (
    <h1 className={`${HEAD} text-hero lg:text-hero-lg text-[var(--color-ink)]`}>
      {HOME.hero.lines[0]}
      <br />
      {HOME.hero.lines[1]}
    </h1>
  )
}

export function CanBlocks() {
  return (
    <ul className="grid gap-6 md:grid-cols-3 md:gap-8">
      {HOME.can.map((c) => (
        <li key={c.id} id={c.id} className="scroll-mt-4 rounded-xs border border-[var(--color-rule)] bg-white p-8">
          <h3 className={`${HEAD} text-title-1 text-[var(--color-ink)]`}>{c.title}</h3>
          <p className="mt-4 text-[var(--color-ink-muted)]">{c.body}</p>
        </li>
      ))}
    </ul>
  )
}
