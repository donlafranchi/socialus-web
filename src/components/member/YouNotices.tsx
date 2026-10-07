// F078 criterion 3 — what the poster is told when something of theirs is hidden.
// In-app only, never email. Nothing renders when there is nothing to say.

export interface Notice {
  id: string
  message: string
  createdAt: string
}

export function YouNotices({ notices }: { notices: Notice[] }) {
  if (notices.length === 0) return null
  return (
    <section className="mt-8" data-testid="you-notices">
      <h2 className="mb-3 text-title-3 text-[var(--color-fg)]">Notices</h2>
      <ul className="divide-y divide-[var(--color-border)] rounded-lg border border-[var(--color-border)]">
        {notices.map((n) => (
          <li key={n.id} className="px-4 py-3">
            <p className="break-words text-body-sm text-[var(--color-fg)]">{n.message}</p>
            <p className="mt-1 text-caption text-[var(--color-fg-muted)]">
              {new Date(n.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </p>
          </li>
        ))}
      </ul>
    </section>
  )
}
