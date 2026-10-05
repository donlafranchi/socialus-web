// #297 — a form field: label, an optional hint, and an inline error tied to
// the control, so a screen reader reads all three.

import { useId, type ReactNode } from 'react'

interface ControlProps {
  id: string
  'aria-describedby'?: string
  'aria-invalid'?: true
}

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: ReactNode
  hint?: ReactNode
  error?: string | null
  children: (props: ControlProps) => ReactNode
}) {
  const id = useId()
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-body-sm font-medium text-[var(--color-fg)]">
        {label}
      </label>
      {children({ id, 'aria-describedby': describedBy, ...(error ? { 'aria-invalid': true as const } : {}) })}
      {hint && (
        <p id={hintId} className="text-caption text-[var(--color-fg-muted)]">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-caption text-red-700">
          {error}
        </p>
      )}
    </div>
  )
}
