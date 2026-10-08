// #296 — not found (L23), for any route that resolves to nothing.
import Link from 'next/link'
import { EmptyState } from '@/components/shell/EmptyState'

export default function NotFound() {
  return (
    <main className="gutter pb-nav">
      <EmptyState
        title="We couldn't find that"
        body="It may have moved, or it may not be shared with you."
        action={{ href: '/explore', label: 'Go to Explore' }}
      />
      <p className="mt-4 text-center text-body-sm">
        <Link href="/report" className="underline">
          Report a problem
        </Link>
      </p>
    </main>
  )
}
