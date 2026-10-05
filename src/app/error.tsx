'use client'

// #296 — the error state (L26) for anything a route throws.
import { EmptyState } from '@/components/shell/EmptyState'

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="gutter pb-nav">
      <EmptyState title="Something went wrong" body="It's on our side. Try again in a moment." />
      <div className="flex justify-center">
        <button type="button" onClick={reset} className="btn-secondary">
          Try again
        </button>
      </div>
    </main>
  )
}
