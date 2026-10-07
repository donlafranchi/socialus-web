// #458 — the PM, 2026-10-06: the public Page is a header block, then titled,
// contained sections (Google Business Profile's listing, Airbnb's listing page).

import type { ReactNode } from 'react'

export function PageSection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section
      data-section={id}
      data-testid={`page-section-${id}`}
      aria-labelledby={`page-section-${id}-title`}
      className="card flex flex-col gap-3 border border-[var(--color-border)] p-4"
    >
      <h2 id={`page-section-${id}-title`} className="text-title-3 text-[var(--color-fg)]">
        {title}
      </h2>
      {children}
    </section>
  )
}
