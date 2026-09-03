'use client'

// T116 — the inline List/Map toggle (F044). Inline, in the document flow, so
// it scrolls with the results: Explore already carries three fixed layers
// (sticky search row, kind pills, nav) and a fourth would compress the
// scrollable area it sits in.
//
// Two tablists now point at `#explore-results` — this one and T114's kind
// pills. Both genuinely control that region; the panel's `aria-labelledby`
// stays on the kind tab, which is the more meaningful label ("Events" says
// more about what is in the panel than "List" does).

import { useRef } from 'react'
import { MapIcon, List } from 'lucide-react'
import { EXPLORE_RESULTS_ID } from './KindFilterPills'

export type ExploreView = 'list' | 'map'

const VIEWS = [
  { value: 'list', label: 'List' },
  { value: 'map', label: 'Map' },
] as const

interface ListMapToggleProps {
  view: ExploreView
  onChange: (view: ExploreView) => void
}

export function ListMapToggle({ view, onChange }: ListMapToggleProps) {
  const tabs = useRef<(HTMLButtonElement | null)[]>([])
  const selectedIndex = VIEWS.findIndex((v) => v.value === view)

  const onKeyDown = (e: React.KeyboardEvent) => {
    const last = VIEWS.length - 1
    const next =
      e.key === 'ArrowRight' ? (selectedIndex === last ? 0 : selectedIndex + 1)
      : e.key === 'ArrowLeft' ? (selectedIndex === 0 ? last : selectedIndex - 1)
      : e.key === 'Home' ? 0
      : e.key === 'End' ? last
      : null
    if (next === null) return
    e.preventDefault()
    onChange(VIEWS[next].value)
    // Focus follows selection, as it does on the kind pills — a roving
    // tabindex alone would strand the ring on the tab just left.
    tabs.current[next]?.focus()
  }

  return (
    <div
      data-testid="list-map-toggle"
      role="tablist"
      aria-label="View"
      aria-orientation="horizontal"
      onKeyDown={onKeyDown}
      className="my-6 flex items-center justify-center gap-2"
    >
      {VIEWS.map((v, i) => {
        const isSelected = i === selectedIndex
        return (
          <button
            key={v.value}
            ref={(el) => {
              tabs.current[i] = el
            }}
            type="button"
            role="tab"
            aria-selected={isSelected}
            aria-controls={EXPLORE_RESULTS_ID}
            tabIndex={isSelected ? 0 : -1}
            data-view={v.value}
            data-active={isSelected}
            onClick={() => onChange(v.value)}
            // The ring colour is set unconditionally, not under
            // `focus-visible:`. The UA default for `outline-color` is
            // `currentColor`, which on the selected tab is white — an invisible
            // ring against the white page. Setting it always means the colour
            // is in the computed style whether or not the tab is focused, so
            // the regression is visible to a test and to a screenshot instead
            // of only to a keyboard user. Nothing paints until
            // `focus-visible:outline` supplies a style.
            className={`inline-flex min-h-11 items-center gap-1.5 rounded-full border px-5 text-sm font-medium transition-colors outline-[var(--color-accent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${
              isSelected
                ? 'border-transparent bg-[var(--color-charcoal-700)] text-white'
                : 'border-[var(--color-charcoal-100)] bg-white text-[var(--color-charcoal-900)]'
            }`}
          >
            {v.value === 'list' ? <List size={14} aria-hidden="true" /> : <MapIcon size={14} aria-hidden="true" />}
            {v.label}
          </button>
        )
      })}
    </div>
  )
}
