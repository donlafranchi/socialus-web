'use client'

// What the map shows when a pin is tapped.
//
// Replaces BusinessDetailCard, which was built around vendor-era concepts that
// no longer exist: ownership tier, the `supports` table, a `/business/[slug]`
// URL. Vendors are retired (DECISIONS 2026-09-16) and a Page is what a pin
// points at now.
//
// Deliberately thin. The Page itself is the place for detail; this is the step
// between seeing a pin and deciding to open it.

import Link from 'next/link'

export interface PageDetailCardPage {
  id: string
  name: string
  category: string | null
  photoUrl: string | null
  locationLabel: string | null
  href: string | null
}

export function PageDetailCard({
  page,
  onClose,
}: {
  page: PageDetailCardPage
  onClose: () => void
}) {
  return (
    <div
      data-testid="page-detail-card"
      className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl shadow-[0_-6px_16px_rgba(0,0,0,0.12)] p-6 pb-8 z-30 max-h-[70vh] overflow-y-auto"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="press absolute right-4 top-4 rounded-full px-2 text-neutral-500 hover:text-neutral-800"
      >
        ×
      </button>

      <div className="flex gap-4">
        {page.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            data-testid="page-detail-photo"
            src={page.photoUrl}
            alt=""
            className="h-20 w-20 rounded-lg object-cover flex-shrink-0"
          />
        ) : null}

        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-neutral-900 truncate">{page.name}</h2>
          {page.category ? (
            <p className="text-sm text-neutral-600 mt-0.5">{page.category}</p>
          ) : null}
          {page.locationLabel ? (
            <p className="text-sm text-neutral-500 mt-0.5" data-testid="page-detail-location">
              {page.locationLabel}
            </p>
          ) : null}
        </div>
      </div>

      {page.href ? (
        <Link href={page.href} className="btn-primary mt-4 inline-block" data-testid="page-detail-open">
          Open this Page
        </Link>
      ) : (
        // A Page whose place path did not resolve still earns its pin; it just
        // has nowhere to send you yet. Saying so beats a link that 404s.
        <p className="mt-4 text-sm text-neutral-500" data-testid="page-detail-no-link">
          This Page has no address to open yet.
        </p>
      )}
    </div>
  )
}
