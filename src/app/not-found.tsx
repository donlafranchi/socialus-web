// #296 — not found (L23), for any route that resolves to nothing.
import { EmptyState } from '@/components/shell/EmptyState'

export default function NotFound() {
  return (
    <main className="gutter pb-nav">
      <EmptyState
        title="We couldn't find that"
        body="It may have moved, or it may not be shared with you."
        action={{ href: '/explore', label: 'Go to Explore' }}
      />
    </main>
  )
}
