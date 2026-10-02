'use client'

// T187 — under 1024px, one floating pill that names the view it switches to
// (F059 criterion 5; Airbnb's pattern). Fixed above the phone nav and the
// safe area, so it stays put while the cards scroll under it.

import { MapIcon, List } from 'lucide-react'
import { BROWSE_RESULTS_ID } from '@/components/browse/results-id'
import type { ExploreView } from './ListMapToggle'

export function ViewPill({ view, onChange }: { view: ExploreView; onChange: (view: ExploreView) => void }) {
  const next: ExploreView = view === 'list' ? 'map' : 'list'
  return (
    <button
      type="button"
      data-testid="view-pill"
      aria-controls={BROWSE_RESULTS_ID}
      onClick={() => onChange(next)}
      className="press fixed bottom-[calc(var(--nav-height)+env(safe-area-inset-bottom)+16px)] left-1/2 z-30 inline-flex min-h-11 -translate-x-1/2 items-center gap-1.5 rounded-full bg-[var(--color-charcoal-700)] px-5 text-sm font-medium text-white shadow-overlay outline-[var(--color-accent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 md:bottom-[calc(env(safe-area-inset-bottom)+24px)]"
    >
      {next === 'map' ? <MapIcon size={14} className="reacts" aria-hidden="true" /> : <List size={14} className="reacts" aria-hidden="true" />}
      {next === 'map' ? 'Map' : 'List'}
    </button>
  )
}
