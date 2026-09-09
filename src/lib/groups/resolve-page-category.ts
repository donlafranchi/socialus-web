// T144 — the Page's own free-text category ("Something else"), read for
// public display. pg-pool-shaped rather than Supabase-client-shaped: the
// table's RLS (T141, migration 040) scopes SELECT to the author or
// founder, correct for its stated admin surface but wrong for this one
// public-display read — same fix-forward pattern T143 used for the
// position resolver rather than widening the policy with a new migration.

import { withTransaction } from '@/actions/_lib/db'

export async function resolvePageCategoryOtherText(groupId: string): Promise<string | null> {
  return withTransaction(async (client) => {
    const res = await client.query<{ raw_text: string }>(
      `select raw_text
         from public.group_category_suggestions
        where group_id = $1
        order by created_at desc
        limit 1`,
      [groupId],
    )
    return res.rows[0]?.raw_text ?? null
  })
}
