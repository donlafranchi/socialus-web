// #296 — the empty / error / not-found state (L23, L26): what happened, in
// one line, and one way on.

import Link from 'next/link'

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string
  body?: string
  action?: { href: string; label: string }
}) {
  return (
    <div className="mx-auto flex w-full max-w-form flex-col items-center gap-3 py-12 text-center">
      <h1 className="text-title-2 text-[var(--color-fg)]">{title}</h1>
      {body && <p className="text-body-sm text-[var(--color-fg-muted)]">{body}</p>}
      {action && (
        <Link href={action.href} className="btn-primary mt-2">
          {action.label}
        </Link>
      )}
    </div>
  )
}
