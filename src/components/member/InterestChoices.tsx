// #892 — the 12 interests as a plain checklist (Don, 2026-10-18 [always]: no chip or pill UI), shared by You
// and the step after sign-up. Native checkboxes, one 44px row each.

import { INTEREST_VOCAB } from '@/lib/onboarding/interest-vocab'

export function InterestChoices({ selected, onToggle, label }: { selected: readonly string[]; onToggle: (tag: string) => void; label: string }) {
  return (
    <fieldset>
      <legend className="sr-only">{label}</legend>
      <ul className="grid gap-x-6 sm:grid-cols-2">
        {INTEREST_VOCAB.map((t) => (
          <li key={t.tag}>
            <label className="flex min-h-tap cursor-pointer items-center gap-3 text-body-sm text-[var(--color-fg)]">
              <input type="checkbox" className="h-5 w-5 shrink-0 accent-[var(--color-charcoal-700)]" checked={selected.includes(t.tag)} onChange={() => onToggle(t.tag)} />
              {t.label}
            </label>
          </li>
        ))}
      </ul>
    </fieldset>
  )
}
