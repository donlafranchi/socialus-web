// #491 — Pages whose photo is removed and still in storage: what the operator
// can delete for good. Reads go server-side over DATABASE_URL.

import { withTransaction } from '@/actions/_lib/db'
import type { PurgeCandidate } from '@/app/admin/reports/PurgeList'

export async function fetchPurgeCandidates(limit = 100): Promise<PurgeCandidate[]> {
  return withTransaction(async (client) => {
    const res = await client.query<{ id: string; name: string; photo_removed_at: Date }>(
      `select id, name, photo_removed_at
         from public.groups
        where photo_removed_at is not null and photo_url is not null and photo_purged_at is null
        order by photo_removed_at
        limit $1`,
      [limit],
    )
    return res.rows.map((r) => ({ groupId: r.id, name: r.name, removedAt: r.photo_removed_at }))
  })
}
