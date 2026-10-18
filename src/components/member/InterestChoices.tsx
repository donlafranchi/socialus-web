// #892 — the 12 interests as tappable pills, shared by You and the step after sign-up. Native checkboxes
// behind sr-only, so checked state and keyboard come from the platform (same pattern as the filter sheet).

import { INTEREST_VOCAB } from '@/lib/onboarding/interest-vocab'

export function InterestChoices({ selected, onToggle, label }: { selected: readonly string[]; onToggle: (tag: string) => void; label: string }) {
  return (
    <fieldset>
      <legend className="sr-only">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {INTEREST_VOCAB.map((t) => {
          const on = selected.includes(t.tag)
          return (
            <label
              key={t.tag}
              className={`inline-flex min-h-11 cursor-pointer items-center rounded-full border px-3 text-sm font-medium transition-colors ${
                on ? 'border-transparent bg-[var(--color-charcoal-700)] text-white' : 'border-[var(--color-charcoal-100)] bg-white text-[var(--color-charcoal-900)]'
              } has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--color-accent)]`}
            >
              <input type="checkbox" className="sr-only" checked={on} onChange={() => onToggle(t.tag)} />
              {t.label}
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}
