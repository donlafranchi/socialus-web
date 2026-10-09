// #491 — delete removed photos for good (docs/purge-proposal.md). Operator only;
// anyone else gets 404, not 403, like the review queue.

import Link from 'next/link'
import { requirePagePermission } from '@/lib/staff/page-guard'
import { fetchPurgeCandidates } from '@/lib/admin/purge-queue'
import { PurgeList } from '../PurgeList'
import { purgePhotoAction } from '../purge-actions'

export const dynamic = 'force-dynamic'

export default async function AdminPurgePage() {
  await requirePagePermission('reports.review')
  const candidates = await fetchPurgeCandidates()
  return (
    <main className="mx-auto w-full max-w-read gutter py-6 pb-nav" data-testid="admin-purge">
      <p className="text-body-sm">
        <Link href="/admin/reports" className="underline">
          Back to reports
        </Link>
      </p>
      <h1 className="mt-2 text-title-1 text-[var(--color-fg)]">Removed photos</h1>
      <p className="mb-4 mt-1 text-body-sm text-[var(--color-fg-muted)]">
        Removing a photo can be undone. Deleting it for good can’t.
      </p>
      <PurgeList candidates={candidates} onPurge={purgePhotoAction} />
    </main>
  )
}
