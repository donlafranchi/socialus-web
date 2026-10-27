// F082 criterion 7 — the rules, one click from the publish step and the footer.
// Wording is draft ([public-is-draft]); the text lives in src/lib/creator-rules.ts.

import type { Metadata } from 'next'
import { CREATOR_RULES } from '@/lib/creator-rules'
import { COPY } from '@/lib/copy'

export const metadata: Metadata = { title: 'The rules — SocialUs' }

export default function RulesPage() {
  return (
    <main className="mx-auto w-full max-w-read gutter py-8 pb-nav">
      <h1 className="text-title-1 md:text-title-1-lg text-[var(--color-fg)]">The rules</h1>
      <p data-testid="rules-headline" className="mt-4 text-title-2 text-[var(--color-fg)]">{COPY.rulesHeadline}</p>
      {/* The rule lines alone; the reasons stay in the publish step's agreement (F082), the PM's call 2026-10-27. */}
      <ul className="mt-6 flex flex-col gap-3">
        {CREATOR_RULES.map((r) => (
          <li key={r.rule} className="text-body font-medium text-[var(--color-fg)]">{r.rule}</li>
        ))}
      </ul>
      <p data-testid="rules-thanks" className="mt-8 text-body text-[var(--color-fg-muted)]">{COPY.decencyThanks}</p>
    </main>
  )
}
