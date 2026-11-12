// The front door's look, shared by `/`, `/join` and the one-time welcome (/welcome): the font,
// the class strings and the one line, so the three cannot drift apart.

import localFont from 'next/font/local'
import { HOME, MESSAGE } from '@/lib/home-landing'

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

/** The message (Don, 2026-11-06), and his own sentence under it. Nothing else competes. */
export function Message() {
  return (
    <>
      <h1 className={`${HEAD} text-hero lg:text-hero-lg text-[var(--color-ink)]`}>{MESSAGE}</h1>
      <p className="mx-auto mt-6 max-w-read text-lede text-[var(--color-ink-muted)] md:mx-0">{HOME.hero.body}</p>
    </>
  )
}
