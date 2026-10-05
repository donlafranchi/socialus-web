// #353 — unclaimed Pages, for the operator: where each came from (the source
// log), who asked to claim or remove it, and Restore for a hidden one. A
// non-operator gets 404, as on /admin/reports.

import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import { isOperator } from '@/actions/_lib/operator'
import { fetchUnclaimedPages } from '@/lib/admin/unclaimed-queue'
import { restoreUnclaimedAction } from './actions'

export const dynamic = 'force-dynamic'

export default async function AdminUnclaimedPage() {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  if (!isOperator(data.user?.id ?? null)) notFound()

  const pages = await fetchUnclaimedPages()

  return (
    <main className="mx-auto w-full max-w-xl px-3 py-4" data-testid="admin-unclaimed">
      <h1 className="text-lg font-semibold text-[var(--color-fg)]">Unclaimed Pages</h1>
      <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
        {pages.length === 0 ? 'Nothing here.' : `${pages.filter((p) => p.hiddenAt).length} hidden by a removal request`}
      </p>
      <ul className="mt-4 flex list-none flex-col gap-4 p-0">
        {pages.map((p) => (
          <li key={p.groupId} className="card flex flex-col gap-2 p-3 text-sm" data-testid="unclaimed-row">
            <div className="flex items-center gap-2">
              <a href={`/g/${p.publicId}`} className="font-medium underline">
                {p.name}
              </a>
              {p.hiddenAt && (
                <span className="chip text-xs">Hidden {p.hiddenAt.toISOString().slice(0, 10)}</span>
              )}
            </div>
            {p.requests.length > 0 && (
              <ul className="flex list-none flex-col gap-1 p-0">
                {p.requests.map((r, i) => (
                  <li key={i}>
                    <strong>{r.kind === 'removal' ? 'Remove' : 'Claim'}</strong> · {r.name ? `${r.name}, ` : ''}
                    {r.contact} · {r.createdAt.toISOString().slice(0, 10)}
                    {r.text ? <span className="block text-[var(--color-fg-muted)]">{r.text}</span> : null}
                  </li>
                ))}
              </ul>
            )}
            <details>
              <summary>Sources ({p.sources.length})</summary>
              <ul className="list-none p-0">
                {p.sources.map((s, i) => (
                  <li key={i}>
                    {s.field}: <a href={s.url} rel="noopener nofollow" target="_blank" className="underline">{s.url}</a>{' '}
                    · {String(s.capturedOn).slice(0, 10)} · {s.capturedBy}
                  </li>
                ))}
              </ul>
            </details>
            {p.hiddenAt && (
              <form action={restoreUnclaimedAction.bind(null, p.groupId)}>
                <button type="submit" className="btn-secondary text-sm">
                  Restore
                </button>
              </form>
            )}
          </li>
        ))}
      </ul>
    </main>
  )
}
