import type { Metadata } from 'next'
import Link from 'next/link'
import { ABOUT } from '@/lib/landing-copy'

// The preview's own About (2026-10-08). `/about` is untouched.
export const metadata: Metadata = {
  title: `${ABOUT.title} — SocialUs`,
  robots: { index: false, follow: false },
}

export default function LandingAboutPage() {
  return (
    <main className="mx-auto w-full max-w-read gutter py-8 pb-nav">
      <Link href="/landing" className="text-body-sm text-[var(--color-accent-text)]">
        &larr; Back
      </Link>
      <h1 className="mt-4 text-title-1 md:text-title-1-lg text-[var(--color-fg)]">{ABOUT.title}</h1>
      {ABOUT.sections.map((s) => (
        <section key={s.id} id={s.id} className="mt-10">
          <h2 className="text-title-2 text-[var(--color-fg)]">{s.title}</h2>
          {'body' in s && s.body.map((p) => <P key={p}>{p}</P>)}
          {'intro' in s && (
            <>
              <P>{s.intro}</P>
              <List items={s.list} />
              <P>{s.after}</P>
              <List items={s.later} />
              <P>{s.outro}</P>
            </>
          )}
          {'steps' in s && (
            <>
              <ol className="mt-4 list-decimal space-y-2 pl-6 text-body text-[var(--color-fg)]">
                {s.steps.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ol>
              {s.after.map((p) => (
                <P key={p}>{p}</P>
              ))}
            </>
          )}
        </section>
      ))}
    </main>
  )
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="mt-4 text-body text-[var(--color-fg)]">{children}</p>
}

function List({ items }: { items: readonly string[] }) {
  return (
    <ul className="mt-3 list-disc space-y-2 pl-6 text-body text-[var(--color-fg)]">
      {items.map((x) => (
        <li key={x}>{x}</li>
      ))}
    </ul>
  )
}
