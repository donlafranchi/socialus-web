'use client'

// T115 — removable chips for the active secondary filters (F045).
//
// Kind never appears here: the pill row at the bottom already carries it. The
// row renders nothing at all when no secondary filter is set — zero filters,
// zero chrome — so callers can drop it in unconditionally.

import { X } from 'lucide-react'
import { activeFilterChips, type SecondaryFilters } from '@/lib/explore/filters'

interface ActiveFilterChipsProps {
  filters: SecondaryFilters
  onRemove: (chipId: string) => void
}

export function ActiveFilterChips({ filters, onRemove }: ActiveFilterChipsProps) {
  const chips = activeFilterChips(filters)
  if (chips.length === 0) return null

  return (
    <div
      role="group"
      aria-label="Active filters"
      data-testid="explore-filter-chips"
      // Wraps rather than scrolls: a chip pushed off the right edge is a filter
      // the member can no longer see or remove.
      className="flex flex-wrap gap-2 border-b border-[var(--color-charcoal-100)] bg-white px-3 py-2"
    >
      {chips.map((chip) => (
        <span
          key={chip.id}
          data-testid="explore-filter-chip"
          className="inline-flex items-center gap-1 rounded-full border border-[var(--color-charcoal-100)] bg-white py-1 pl-3 pr-1 text-sm font-medium text-[var(--color-charcoal-900)]"
        >
          {chip.label}
          <button
            type="button"
            onClick={() => onRemove(chip.id)}
            aria-label={`Remove ${chip.label} filter`}
            // ::before grows the 32px control to the chip's full 42px height
            // without changing what's drawn; 5px each side stays inside the
            // 8px row gap, so a wrapped row's chips never overlap.
            className="relative inline-flex h-8 w-8 items-center justify-center rounded-full text-neutral-600 before:absolute before:inset-x-0 before:-top-[5px] before:-bottom-[5px] before:content-[''] hover:bg-neutral-100"
          >
            <X size={14} />
          </button>
        </span>
      ))}
    </div>
  )
}
