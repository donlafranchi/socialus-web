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
//
// T156 — this is the ONLY place filtering happens. Ruled 2026-09-12 (Don):
// zero filter pills outside the filter view, at every viewport width — the
// ruling is about the results surface, not about how wide the screen is, so
// there is no desktop pill row either. Free-text search stays on the results
// surface, because search is not a filter control.
//
// Two groups left. Distance and Sort went with T156: see
// `@/lib/browse/filters` for why each one could not stay honest.

import { useEffect, useId, useState } from 'react'
import { Sheet } from '@/components/ui/Sheet'
import {
  DEFAULT_BROWSE_FILTERS,
  SCHEDULE_OPTIONS,
  hasBrowseFilters,
  toggleTag,
  type BrowseFilters,
  type ScheduleFilter,
} from '@/lib/browse/filters'

interface ExploreFilterSheetProps {
  open: boolean
  value: BrowseFilters
  /** Tags present in the current result set — creators make their own. */
  tags: string[]
  onClose: () => void
  onApply: (filters: BrowseFilters) => void
}

export function ExploreFilterSheet({
  open,
  value,
  tags,
  onClose,
  onApply,
}: ExploreFilterSheetProps) {
  const [draft, setDraft] = useState(value)
  // Options come from the current result set, so a search can drop a tag that
  // is still selected. Union the selection back in, or the sheet would show a
  // filter the member cannot turn off from inside the sheet.
  const tagOptions = Array.from(new Set([...tags, ...draft.tags])).sort()
  const groupId = useId()

  useEffect(() => {
    if (open) setDraft(value)
  }, [open])

  const commit = (filters: BrowseFilters) => {
    onApply(filters)
    onClose()
  }

  // #297 — on the shared sheet: modal, focus in and back, Escape, backdrop.
  return (
    <Sheet
      open={open}
      title="Filters"
      onClose={onClose}
      testId="explore-filter-sheet"
      backdropTestId="filter-sheet-backdrop"
      closeLabel="Close filters"
      headerAction={
        hasBrowseFilters(draft) && (
          <button
            type="button"
            onClick={() => {
              setDraft(DEFAULT_BROWSE_FILTERS)
              commit(DEFAULT_BROWSE_FILTERS)
            }}
            className="inline-flex min-h-tap items-center rounded-full px-2 text-body-sm font-medium text-[var(--color-charcoal-900)] underline hover:bg-neutral-100"
          >
            Clear all
          </button>
        )
      }
      footer={
        <button
          type="button"
          onClick={() => commit(draft)}
          className="w-full rounded-full bg-[var(--color-charcoal-700)] py-3 text-body-sm font-semibold text-white"
        >
          Show results
        </button>
      }
    >
      <div data-testid="filter-sheet-body">
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

        {tagOptions.length > 0 && (
          <Group label="Tags">
            <Options>
              {tagOptions.map((tag) => (
                <Choice
                  key={tag}
                  type="checkbox"
                  name={`${groupId}-tag-${tag}`}
                  /* The tag IS the label. Creators type their own — nothing
                     seeds a display name to look up (T159, #64). */
                  label={tag}
                  checked={draft.tags.includes(tag)}
                  onChange={() => setDraft((d) => toggleTag(d, tag))}
                />
              ))}
            </Options>
          </Group>
        )}
      </div>
    </Sheet>
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
}

function Choice({ name, label, checked, onChange, type = 'radio' }: ChoiceProps) {
  return (
    <label
      className={`inline-flex min-h-11 cursor-pointer items-center rounded-full border px-4 text-sm font-medium transition-colors ${
        checked
          ? 'border-transparent bg-[var(--color-charcoal-700)] text-white'
          : 'border-[var(--color-charcoal-100)] bg-white text-[var(--color-charcoal-900)]'
      } has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--color-accent)]`}
    >
      <input type={type} name={name} className="sr-only" checked={checked} onChange={onChange} />
      {label}
    </label>
  )
}
