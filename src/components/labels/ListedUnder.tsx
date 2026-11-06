'use client'

// #1180 — "Listed under: X · Change", in place of the free tag box (plan #273, Don ruled B, 2026-11-05).
// Until the poster picks, it follows what they write (the word match, then the Page's labels, then Neighborhood
// life). Change opens the 12 labels with their finer ones beneath; up to 3 picks, and a pick is pinned.
// "Listed under" and "Change" are draft words for Don.

import { useState } from 'react'
import { Sheet } from '@/components/ui/Sheet'
import { Button } from '@/components/ui/Button'
import { EXTRAS, LABELS, MAX_PICKS } from '@/lib/labels/list'
import { isExtra, listedUnder, reducePicks, toStoredTags } from '@/lib/labels/match'

export interface ListedValue {
  picks: string[]
  pinned: boolean
}

export const UNPINNED: ListedValue = { picks: [], pinned: false }

interface Words {
  text: string
  pageTags?: readonly string[]
}

/** What the composer shows and saves: the poster's pick when pinned, else the suggestion. */
export const currentLabels = (value: ListedValue, words: Words): string[] =>
  toStoredTags(value.pinned ? value.picks : listedUnder(words))

export const labelsToSend = (value: ListedValue, words: Words) => ({ tags: currentLabels(value, words), labelsPinned: value.pinned })

/** A saved row, read back: its labels, pinned if the poster picked them. */
export const savedValue = (tags: readonly string[], pinned: boolean): ListedValue => ({ picks: reducePicks(tags), pinned })

export function ListedUnder({
  value,
  onChange,
  text,
  pageTags,
  idPrefix,
}: {
  value: ListedValue
  onChange: (next: ListedValue) => void
  text: string
  pageTags?: readonly string[]
  idPrefix: string
}) {
  const [open, setOpen] = useState(false)
  const labels = currentLabels(value, { text, pageTags })
  return (
    <div>
      <p data-testid={`${idPrefix}-listed`} className="text-body-sm text-[var(--color-fg)]">
        <span className="text-[var(--color-fg-muted)]">Listed under: </span>
        {labels.join(' · ')}
        <span aria-hidden> · </span>
        <button type="button" onClick={() => setOpen(true)} className="min-h-tap font-medium text-[var(--color-accent)] hover:underline">
          Change
        </button>
      </p>
      {open && (
        <ChangeSheet
          idPrefix={idPrefix}
          initial={reducePicks(value.pinned ? value.picks : listedUnder({ text, pageTags }))}
          onClose={() => setOpen(false)}
          onSave={(picks) => {
            onChange({ picks, pinned: true })
            setOpen(false)
          }}
        />
      )}
    </div>
  )
}

function ChangeSheet({ idPrefix, initial, onClose, onSave }: { idPrefix: string; initial: string[]; onClose: () => void; onSave: (picks: string[]) => void }) {
  const [picked, setPicked] = useState<string[]>(initial)
  const full = picked.filter((p) => !isExtra(p)).length >= MAX_PICKS
  const toggle = (label: string) =>
    setPicked((p) => (p.includes(label) ? p.filter((x) => x !== label) : full && !isExtra(label) ? p : [...p, label]))
  const box = (label: string, finer: boolean) => (
    <label key={label} className={`flex min-h-tap cursor-pointer items-center gap-3 ${finer ? 'pl-7' : ''}`}>
      <input
        type="checkbox"
        className="h-4 w-4"
        checked={picked.includes(label)}
        disabled={full && !isExtra(label) && !picked.includes(label)}
        onChange={() => toggle(label)}
      />
      <span className={`text-body-sm text-[var(--color-fg)] ${finer ? '' : 'font-semibold'}`}>{label}</span>
    </label>
  )
  return (
    <Sheet
      open
      title="Listed under"
      description={`Pick up to ${MAX_PICKS}.`}
      onClose={onClose}
      testId={`${idPrefix}-sheet`}
      footer={
        <Button onClick={() => onSave(picked)} disabled={picked.every(isExtra)} className="w-full" data-testid={`${idPrefix}-save`}>
          Save
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        {LABELS.map((top) => (
          <fieldset key={top.label} className="flex flex-col">
            <legend className="sr-only">{top.label}</legend>
            {box(top.label, false)}
            {top.finer.map((f) => box(f.label, true))}
          </fieldset>
        ))}
        <fieldset className="flex flex-col border-t border-[var(--color-border)] pt-3">
          <legend className="sr-only">Also</legend>
          {EXTRAS.map((e) => box(e.label, false))}
        </fieldset>
      </div>
    </Sheet>
  )
}
