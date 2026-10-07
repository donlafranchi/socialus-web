// #296 — About, Terms and Privacy (L27): one read-width page of text.

import { TEXT_PAGE_PLACEHOLDER, type TextPageContent } from '@/lib/text-pages'

export function TextPage({ page }: { page: TextPageContent }) {
  return (
    <main className="mx-auto w-full max-w-read gutter py-8 pb-nav">
      <h1 className="text-title-1 md:text-title-1-lg text-[var(--color-fg)]">{page.title}</h1>
      {page.counsel?.length ? (
        // Copy is a placeholder ([public-is-draft]). The counsel list itself is never shown.
        <p data-testid="text-page-draft" className="mt-2 text-caption text-[var(--color-fg-muted)]">
          This is a draft for the beta and has not been reviewed by a lawyer yet.
        </p>
      ) : null}
      {page.status === 'placeholder' ? (
        <p data-testid="text-page-placeholder" className="mt-4 text-body text-[var(--color-fg-muted)]">
          {TEXT_PAGE_PLACEHOLDER}
        </p>
      ) : (
        page.body.map((p, i) => (
          <p key={i} className="mt-4 text-body text-[var(--color-fg)]">
            {p}
          </p>
        ))
      )}
    </main>
  )
}
