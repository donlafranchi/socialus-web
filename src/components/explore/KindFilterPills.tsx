'use client'

// T114 — kind-filter pills (F045). A fixed row in the thumb zone, structurally
// independent of BottomNav: the nav's translateY can't drag the pills with it,
// which is what makes "pills stay, nav hides" work (PM ratified 2026-09-02).

import { useEffect, useRef } from 'react'
import { KIND_FILTERS, kindTabId, type ItemKindFilter } from '@/lib/explore/kinds'
import { useNavVisible } from '../NavVisibilityProvider'

/** id of the results region the tabs control. */
export const EXPLORE_RESULTS_ID = 'explore-results'

/** Row height, thesis §5. Callers reserve this much space above the nav. */
export const KIND_PILL_ROW_HEIGHT = 44

interface KindFilterPillsProps {
  selected: ItemKindFilter
  onSelect: (kind: ItemKindFilter) => void
}

export function KindFilterPills({ selected, onSelect }: KindFilterPillsProps) {
  const navVisible = useNavVisible()
  const tabs = useRef<(HTMLButtonElement | null)[]>([])
  const selectedIndex = Math.max(
    0,
    KIND_FILTERS.findIndex((k) => k.value === selected),
  )

  // A restored `?kind=` can land on a pill that is scrolled off the right edge.
  // The row is the only place the member reads the active kind, so keep it visible.
  useEffect(() => {
    tabs.current[selectedIndex]?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
  }, [selectedIndex])

  const onKeyDown = (e: React.KeyboardEvent) => {
    const last = KIND_FILTERS.length - 1
    const next =
      e.key === 'ArrowRight' ? (selectedIndex === last ? 0 : selectedIndex + 1)
      : e.key === 'ArrowLeft' ? (selectedIndex === 0 ? last : selectedIndex - 1)
      : e.key === 'Home' ? 0
      : e.key === 'End' ? last
      : null
    if (next === null) return
    e.preventDefault()
    onSelect(KIND_FILTERS[next].value)
    // Focus follows selection (WAI-ARIA tabs, automatic activation) — the roving
    // tabindex alone would leave the ring on the pill the member just left.
    tabs.current[next]?.focus()
  }

  return (
    <div
      data-testid="kind-filter-pills"
      role="tablist"
      aria-label="Filter by kind"
      aria-orientation="horizontal"
      data-nav-visible={navVisible ? 'true' : 'false'}
      onKeyDown={onKeyDown}
      // Anchored to the safe area and lifted a nav-height when the nav is on
      // screen — transform rather than `bottom` so the shift is compositor-only
      // and shares the nav's 200ms ease-out exactly.
      className={`fixed inset-x-0 z-30 flex items-center gap-2 overflow-x-auto border-t border-[var(--color-charcoal-100)] bg-white px-3 transition-transform duration-200 ease-out will-change-transform motion-reduce:transition-none md:hidden ${
        navVisible ? '-translate-y-[var(--nav-height)]' : 'translate-y-0'
      }`}
      style={{ height: KIND_PILL_ROW_HEIGHT, bottom: 'env(safe-area-inset-bottom)' }}
    >
      {KIND_FILTERS.map((k, i) => {
        const isSelected = i === selectedIndex
        return (
          <button
            key={k.label}
            ref={(el) => {
              tabs.current[i] = el
            }}
            type="button"
            role="tab"
            id={kindTabId(k.value)}
            aria-selected={isSelected}
            aria-controls={EXPLORE_RESULTS_ID}
            tabIndex={isSelected ? 0 : -1}
            data-kind={k.value ?? 'all'}
            onClick={() => onSelect(k.value)}
            // The 32px pill is centred in the 44px row; ::before grows the hit
            // area to the full row height without changing what's drawn.
            // Ring colour set unconditionally (T116) — the UA default is
            // `currentColor`, which on the selected pill is white, drawn
            // against the white row. See ListMapToggle for the full note.
            className={`relative inline-flex h-8 shrink-0 items-center rounded-full px-4 text-sm font-medium transition-colors before:absolute before:inset-x-0 before:-top-1.5 before:-bottom-1.5 before:content-[''] outline-[var(--color-accent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${
              isSelected
                ? 'border border-transparent bg-[var(--color-charcoal-700)] text-white'
                : 'border border-[var(--color-charcoal-100)] bg-white text-[var(--color-charcoal-900)]'
            }`}
          >
            {k.label}
          </button>
        )
      })}
    </div>
  )
}
