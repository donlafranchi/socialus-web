'use client'

// T115 — the secondary-filter bottom sheet (F045). A container, not a feature:
// half-height, internally scrollable, dismissed by backdrop / Escape / Show
// results. Edits are held as a draft so the member can change their mind
// without the results churning underneath the sheet — only "Show results" and
// "Clear all" commit.
//
// Every control is a native radio or checkbox behind `sr-only`, so arrow-key
// navigation, group semantics and checked state come from the platform rather
// than from a hand-rolled `role="radiogroup"`.

import { useEffect, useId, useRef, useState } from 'react'
import { X } from 'lucide-react'
import {
  DEFAULT_SECONDARY,
  DISTANCE_OPTIONS,
  SCHEDULE_OPTIONS,
  SORT_OPTIONS,
  hasSecondaryFilters,
  toggleCategory,
  type DistanceMiles,
  type ScheduleFilter,
  type SecondaryFilters,
  type SortOrder,
} from '@/lib/explore/filters'
import { categoryLabel } from '@/lib/explore/items'

const FOCUSABLE =
  'button:not([disabled]), input:not([disabled]), [href], select, textarea, [tabindex]:not([tabindex="-1"])'

interface ExploreFilterSheetProps {
  open: boolean
  value: SecondaryFilters
  /** Category slugs present in the current result set. */
  categories: string[]
  /** False when no origin resolved — distance and "Nearest" cannot be honest. */
  originAvailable: boolean
  onClose: () => void
  onApply: (filters: SecondaryFilters) => void
}

export function ExploreFilterSheet({
  open,
  value,
  categories,
  originAvailable,
  onClose,
  onApply,
}: ExploreFilterSheetProps) {
  const [draft, setDraft] = useState(value)
  // Options come from the current result set, so switching kinds can drop a
  // category that is still selected. Union the selection back in, or the sheet
  // would show a filter the member cannot turn off from inside the sheet.
  const categoryOptions = Array.from(new Set([...categories, ...draft.categories])).sort()
  const sheetRef = useRef<HTMLDivElement>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)
  const titleId = useId()
  const groupId = useId()

  // Re-seed from the committed value on each open, which is what makes a
  // dismissal discard the draft rather than leave it half-applied.
  useEffect(() => {
    if (open) setDraft(value)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    if (!open) return
    returnFocusRef.current = document.activeElement as HTMLElement | null
    sheetRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus()
    // `aria-modal` asserts the rest of the page is inert; letting the results
    // scroll behind the sheet would make that a lie, and on mobile a stray
    // drag scrolls the list instead of the sheet.
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
      returnFocusRef.current?.focus?.()
    }
  }, [open])

  if (!open) return null

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      onClose()
      return
    }
    if (e.key !== 'Tab') return
    const nodes = Array.from(sheetRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])
    if (nodes.length === 0) return
    const first = nodes[0]
    const last = nodes[nodes.length - 1]
    const active = document.activeElement
    if (e.shiftKey && (active === first || !sheetRef.current?.contains(active))) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && active === last) {
      e.preventDefault()
      first.focus()
    }
  }

  const commit = (filters: SecondaryFilters) => {
    onApply(filters)
    onClose()
  }

  return (
    <>
      <div
        data-testid="filter-sheet-backdrop"
        aria-hidden="true"
        onClick={onClose}
        className="fixed inset-0 z-40 bg-black/30 md:bg-black/20"
      />
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={onKeyDown}
        data-testid="explore-filter-sheet"
        className="fixed inset-x-0 bottom-0 z-50 flex max-h-[70vh] flex-col rounded-t-2xl border-t border-[var(--color-charcoal-100)] bg-white shadow-[0_-8px_24px_rgba(0,0,0,0.12)] md:inset-x-auto md:right-4 md:top-28 md:bottom-auto md:w-96 md:rounded-2xl md:border"
      >
        <header className="flex items-center gap-2 border-b border-[var(--color-charcoal-100)] px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close filters"
            className="-ml-2 inline-flex h-9 w-9 items-center justify-center rounded-full text-[var(--color-charcoal-900)] hover:bg-neutral-100"
          >
            <X size={18} />
          </button>
          <h2 id={titleId} className="text-base font-semibold text-[var(--color-charcoal-900)]">
            Filters
          </h2>
          {hasSecondaryFilters(draft) && (
            <button
              type="button"
              onClick={() => {
                setDraft(DEFAULT_SECONDARY)
                commit(DEFAULT_SECONDARY)
              }}
              // Charcoal, not the accent token: `--color-accent` on white is
              // 2.9:1 and `--color-accent-hover` 4.29:1, both short of AA for
              // 14px text. Charcoal-900 is 14.16:1 and matches the sheet's own
              // palette. The token's on-white contrast is an app-wide question
              // — see the canonical-contrast decision stub.
              className="-mr-2 ml-auto inline-flex min-h-11 items-center rounded-full px-2 text-sm font-medium text-[var(--color-charcoal-900)] underline hover:bg-neutral-100"
            >
              Clear all
            </button>
          )}
        </header>

        <div data-testid="filter-sheet-body" className="flex-1 overflow-y-auto px-4 py-4">
          <Group label="Distance">
            {!originAvailable && (
              <p data-testid="distance-unavailable" className="mb-2 text-xs text-neutral-600">
                We don&rsquo;t know where to measure from yet, so distance is unavailable.
              </p>
            )}
            <Options>
              <Choice
                name={`${groupId}-distance`}
                label="Any distance"
                checked={draft.distance === null}
                onChange={() => setDraft((d) => ({ ...d, distance: null }))}
              />
              {DISTANCE_OPTIONS.map((mi) => (
                <Choice
                  key={mi}
                  name={`${groupId}-distance`}
                  label={`${mi} mi`}
                  disabled={!originAvailable}
                  checked={draft.distance === mi}
                  onChange={() => setDraft((d) => ({ ...d, distance: mi as DistanceMiles }))}
                />
              ))}
            </Options>
          </Group>

          <Group label="Schedule">
            <Options>
              {SCHEDULE_OPTIONS.map((s) => (
                <Choice
                  key={s.value}
                  name={`${groupId}-schedule`}
                  label={s.label}
                  checked={draft.schedule === s.value}
                  onChange={() => setDraft((d) => ({ ...d, schedule: s.value as ScheduleFilter }))}
                />
              ))}
            </Options>
          </Group>

          {categoryOptions.length > 0 && (
            <Group label="Category">
              <Options>
                {categoryOptions.map((slug) => (
                  <Choice
                    key={slug}
                    type="checkbox"
                    name={`${groupId}-category-${slug}`}
                    label={categoryLabel(slug)}
                    checked={draft.categories.includes(slug)}
                    onChange={() => setDraft((d) => toggleCategory(d, slug))}
                  />
                ))}
              </Options>
            </Group>
          )}

          <Group label="Sort">
            <Options>
              {SORT_OPTIONS.map((s) => (
                <Choice
                  key={s.value}
                  name={`${groupId}-sort`}
                  label={s.label}
                  disabled={s.value === 'nearest' && !originAvailable}
                  checked={draft.sort === s.value}
                  onChange={() => setDraft((d) => ({ ...d, sort: s.value as SortOrder }))}
                />
              ))}
            </Options>
          </Group>
        </div>

        <footer
          className="border-t border-[var(--color-charcoal-100)] px-4 py-3"
          style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
        >
          <button
            type="button"
            onClick={() => commit(draft)}
            className="w-full rounded-full bg-[var(--color-charcoal-700)] py-3 text-sm font-semibold text-white"
          >
            Show results
          </button>
        </footer>
      </div>
    </>
  )
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <fieldset className="mb-5 last:mb-0">
      <legend className="mb-2 text-sm font-semibold text-[var(--color-charcoal-900)]">{label}</legend>
      {children}
    </fieldset>
  )
}

function Options({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap gap-2">{children}</div>
}

interface ChoiceProps {
  name: string
  label: string
  checked: boolean
  onChange: () => void
  type?: 'radio' | 'checkbox'
  disabled?: boolean
}

function Choice({ name, label, checked, onChange, type = 'radio', disabled }: ChoiceProps) {
  return (
    <label
      className={`inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-medium transition-colors ${
        disabled
          ? 'cursor-not-allowed border-[var(--color-charcoal-100)] bg-neutral-50 text-neutral-400'
          : checked
            ? 'cursor-pointer border-transparent bg-[var(--color-charcoal-700)] text-white'
            : 'cursor-pointer border-[var(--color-charcoal-100)] bg-white text-[var(--color-charcoal-900)]'
      } has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--color-accent)]`}
    >
      <input
        type={type}
        name={name}
        className="sr-only"
        checked={checked}
        disabled={disabled}
        onChange={onChange}
      />
      {label}
    </label>
  )
}
