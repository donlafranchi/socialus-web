// The filter sheet's quiet choices, shared with the search panel. #922 — no chips or pills [always].

export function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <fieldset className="mb-5 last:mb-0">
      <legend className="mb-2 text-sm font-semibold text-[var(--color-charcoal-900)]">{label}</legend>
      {children}
    </fieldset>
  )
}

export function Options({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`flex flex-wrap gap-x-5 ${className}`.trim()}>{children}</div>
}

interface ChoiceProps {
  name: string
  label: string
  checked: boolean
  onChange: () => void
  type?: 'radio' | 'checkbox'
}

export function Choice({ name, label, checked, onChange, type = 'radio' }: ChoiceProps) {
  return (
    // #922 (Don, 2026-10-18) — no chips or pills [always]: a choice is a quiet word; chosen, it is bold and underlined.
    <label
      data-checked={checked || undefined}
      className={`inline-flex min-h-11 cursor-pointer items-center text-sm underline-offset-[6px] transition-colors ${
        checked
          ? 'font-semibold text-[var(--color-charcoal-900)] underline decoration-2'
          : 'text-[var(--color-fg-muted)] hover:text-[var(--color-charcoal-900)]'
      } has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--color-accent)]`}
    >
      <input type={type} name={name} className="sr-only" checked={checked} onChange={onChange} />
      {label}
    </label>
  )
}
