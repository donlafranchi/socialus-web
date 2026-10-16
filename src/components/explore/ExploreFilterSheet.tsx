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

import { isReservedWord } from '@/lib/browse/box-text'
import { useId, useState } from 'react'
import { Sheet } from '@/components/ui/Sheet'
import { normalizeTag } from '@/lib/groups/tags'
import { INTEREST_VOCAB } from '@/lib/onboarding/interest-vocab'
import {
  DATE_OPTIONS,
  DEFAULT_BROWSE_FILTERS,
  POST_KIND_OPTIONS,
  TYPE_OPTIONS,
  hasBrowseFilters,
  isPickedDay,
  togglePostKind,
  toggleTag,
  type BrowseFilters,
} from '@/lib/browse/filters'

interface ExploreFilterSheetProps {
  open: boolean
  value: BrowseFilters
  onClose: () => void
  onApply: (filters: BrowseFilters) => void
}

// #876 (Don, 2026-10-16, on #796): "Target by type or category or date." Three groups, opt-in, that
// combine with each other and with search; the default is everything mixed.
const CATEGORIES = INTEREST_VOCAB.map((t) => ({ value: normalizeTag(t.label), label: t.label }))

export function ExploreFilterSheet({
  open,
  value,
  onClose,
  onApply,
}: ExploreFilterSheetProps) {
  const [draft, setDraft] = useState(value)
  // Options come from the current result set, so a search can drop a tag that
  // is still selected. Union the selection back in, or the sheet would show a
  // filter the member cannot turn off from inside the sheet.
  // A tag with exactly a schedule phrase is the box's own word, so it is not offered (box-text).
  const known = new Set(CATEGORIES.map((c) => c.value))
  const extraTags = draft.tags.filter((t) => !known.has(t) && !isReservedWord(t))
  const groupId = useId()

  // Re-seed from the committed value on each open, which is what makes a
  // dismissal discard the draft rather than leave it half-applied. Done while
  // rendering, on the open edge, rather than in an effect.
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setDraft(value)
  }

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
        <Group label="Type">
          <Options>
            {TYPE_OPTIONS.map((t) => (
              <Choice key={t.value} name={`${groupId}-type`} label={t.label} checked={draft.type === t.value} onChange={() => setDraft((d) => ({ ...d, type: t.value }))} />
            ))}
          </Options>
          <Options className="mt-2">
            {POST_KIND_OPTIONS.map((k) => (
              <Choice
                key={k.value}
                type="checkbox"
                name={`${groupId}-kind-${k.value}`}
                label={k.label}
                checked={draft.postKinds.includes(k.value)}
                onChange={() => setDraft((d) => togglePostKind(d, k.value))}
              />
            ))}
            <Choice
              type="checkbox"
              name={`${groupId}-following`}
              label="Following only"
              checked={draft.following}
              onChange={() => setDraft((d) => ({ ...d, following: !d.following }))}
            />
          </Options>
        </Group>

        <Group label="Category">
          <Options>
            {[...CATEGORIES, ...extraTags.map((t) => ({ value: t, label: t }))].map((c) => (
              <Choice
                key={c.value}
                type="checkbox"
                name={`${groupId}-tag-${c.value}`}
                label={c.label}
                checked={draft.tags.includes(c.value)}
                onChange={() => setDraft((d) => toggleTag(d, c.value))}
              />
            ))}
          </Options>
        </Group>

        <Group label="Date">
          <Options>
            {DATE_OPTIONS.map((o) => (
              <Choice key={o.value} name={`${groupId}-date`} label={o.label} checked={draft.date === o.value} onChange={() => setDraft((d) => ({ ...d, date: o.value }))} />
            ))}
            <label className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[var(--color-charcoal-100)] bg-white px-4 text-sm font-medium text-[var(--color-charcoal-900)]">
              <span>Pick a date</span>
              <input
                type="date"
                data-testid="filter-date-pick"
                aria-label="Pick a date"
                value={isPickedDay(draft.date) ? draft.date : ''}
                onChange={(e) => setDraft((d) => ({ ...d, date: isPickedDay(e.target.value) ? e.target.value : 'any' }))}
                className="min-w-0 bg-transparent text-sm"
              />
            </label>
          </Options>
        </Group>
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

function Options({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`flex flex-wrap gap-2 ${className}`.trim()}>{children}</div>
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
      className={`inline-flex min-h-11 cursor-pointer items-center rounded-full border px-3 text-sm font-medium transition-colors ${
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
