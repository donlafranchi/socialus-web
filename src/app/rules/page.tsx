// F082 criterion 7 — the rules, one click from the publish step and the footer.
// Wording is draft ([public-is-draft]); the text lives in src/lib/creator-rules.ts.

import type { Metadata } from 'next'
import { CREATOR_RULES } from '@/lib/creator-rules'

export const metadata: Metadata = { title: 'The rules — SocialUs' }

export default function RulesPage() {
  return (
    <main className="mx-auto w-full max-w-read gutter py-8 pb-nav">
      <h1 className="text-title-1 md:text-title-1-lg text-[var(--color-fg)]">The rules</h1>
      <p className="mt-4 text-body text-[var(--color-fg-muted)]">
        What you agree to before you publish a Page, and why each one is here.
      </p>
      <ul className="mt-6 flex flex-col gap-5">
        {CREATOR_RULES.map((r) => (
          <li key={r.rule}>
            <p className="text-body font-medium text-[var(--color-fg)]">{r.rule}</p>
            <p className="mt-1 text-body text-[var(--color-fg-muted)]">{r.reason}</p>
          </li>
        ))}
      </ul>
    </main>
  )
}
