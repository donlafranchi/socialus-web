'use client'

// #296 — the error state (L26) for anything a route throws.
import Link from 'next/link'
import { useEffect } from 'react'
import * as Sentry from '@sentry/nextjs'
import { EmptyState } from '@/components/shell/EmptyState'
import { STATUS_PAGE_URL } from '@/lib/status-page'

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  // #490 — reported (scrubbed, and only when error tracking is configured).
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])
  return (
    <main className="gutter pb-dock">
      <EmptyState title="That didn't go through" body="It's on us. Mind trying again in a minute?" />
      <div className="flex justify-center">
        <button type="button" onClick={reset} className="btn-secondary">
          Try again
        </button>
      </div>
      <p className="mt-4 text-center text-body-sm">
        <Link href="/report" className="underline">
          Report a problem with the app
        </Link>
      </p>
      {/* Placeholder words for the copywriter ([public-is-draft]). */}
      <p className="mt-2 text-center text-body-sm">
        Something&rsquo;s not working?{' '}
        <a href={STATUS_PAGE_URL} target="_blank" rel="noopener noreferrer" className="underline">
          Check our status page
        </a>
      </p>
    </main>
  )
}
