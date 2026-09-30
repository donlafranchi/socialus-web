// F080 criterion 5 — said where a member posts; reports (F078) are the backstop.
import { COPY } from '@/lib/copy'

export function PostingSafetyNote() {
  return (
    <p data-testid="posting-safety-note" className="text-sm text-[var(--color-fg-muted)]">
      {COPY.postingSafety}
    </p>
  )
}
