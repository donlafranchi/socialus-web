'use client'

// plan #230 (Don, 2026-10-31) — the kind is picked first. A radio list set in type, two columns on a phone,
// with the picked kind's one-line hint beneath: no chips. Draft copy (human-review).
import { POST_KINDS, POST_KIND_HINT, POST_KIND_WORD, type PostKind } from '@/lib/posts/kinds'

export function PostKindPicker({
  value,
  onChange,
  idPrefix,
  kinds = POST_KINDS,
}: {
  value: PostKind
  onChange: (k: PostKind) => void
  idPrefix: string
  kinds?: readonly PostKind[]
}) {
  const legend = `${idPrefix}-kind-legend`
  return (
    <fieldset role="radiogroup" aria-labelledby={legend} data-testid={`${idPrefix}-kind`} className="border-0 p-0">
      <legend id={legend} className="text-body-sm font-medium text-[var(--color-fg)]">
        What is it?
      </legend>
      <div className="mt-1 grid grid-cols-2 gap-x-4 sm:grid-cols-4">
        {kinds.map((k) => (
          <label key={k} className="flex min-h-tap cursor-pointer items-center gap-2 text-body-sm text-[var(--color-fg)]">
            <input
              type="radio"
              name={`${idPrefix}-kind`}
              value={k}
              checked={value === k}
              onChange={() => onChange(k)}
              className="size-5 accent-[var(--color-charcoal-900)]"
            />
            <span className={value === k ? 'font-semibold' : undefined}>{POST_KIND_WORD[k]}</span>
          </label>
        ))}
      </div>
      <p data-testid={`${idPrefix}-kind-hint`} className="mt-1 text-caption text-[var(--color-fg-muted)]">
        {POST_KIND_HINT[value]}
      </p>
    </fieldset>
  )
}
