// #388 — builder content, for the operator: one switch and one delete, all at
// once (Don, 2026-10-05). Phone-first. A non-operator gets 404.

import { requirePagePermission } from '@/lib/staff/page-guard'
import { fetchBuilderContentState } from '@/lib/admin/builder-content'
import { BuilderContentControls } from './BuilderContentControls'
import { setBuilderContentVisibleAction, deleteAllBuilderContentAction } from './actions'

export const dynamic = 'force-dynamic'

export default async function AdminBuildersPage() {
  await requirePagePermission('builders.manage')

  const state = await fetchBuilderContentState()

  return (
    <main className="mx-auto w-full max-w-xl px-3 py-4" data-testid="admin-builders">
      <h1 className="text-lg font-semibold text-[var(--color-fg)]">Builder content</h1>
      <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
        What the builder agents made. Their own follows and joins never count on real Pages.
      </p>
      <BuilderContentControls
        visible={state.visible}
        pages={state.pages}
        posts={state.posts}
        onSetVisible={setBuilderContentVisibleAction}
        onDeleteAll={deleteAllBuilderContentAction}
      />
    </main>
  )
}
