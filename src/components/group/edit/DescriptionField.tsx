// #108 — the description's limit, shown as it nears it (the server caps it at 2000).

export const DESCRIPTION_LIMIT = 2000
const WARN_AT = 200

export function DescriptionField({ value, onChange, hint }: { value: string; onChange: (v: string) => void; hint?: string }) {
  const left = DESCRIPTION_LIMIT - value.length
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm font-medium text-[var(--color-fg)]">Description</span>
      <textarea
        className="input"
        rows={5}
        maxLength={DESCRIPTION_LIMIT}
        data-testid="edit-description"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {hint && <span className="text-caption text-[var(--color-fg-muted)]">{hint}</span>}
      {left <= WARN_AT && (
        <span data-testid="description-count" aria-live="polite" className="text-caption text-[var(--color-fg-muted)]">
          {left} {left === 1 ? 'character' : 'characters'} left
        </span>
      )}
    </label>
  )
}
