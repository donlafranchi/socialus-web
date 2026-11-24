import type { ClientBase } from 'pg'

/** Features the knowledge imports made, and how many of them some department cannot read (F132, the PM, 2026-11-17: none). */
export async function importedFeatureReaders(db: ClientBase): Promise<{ n: number; hidden: number }> {
  const { rows } = await db.query<{ n: number; hidden: number }>(
    `select count(*)::int as n, count(*) filter (where r.audience <> 'members')::int as hidden
       from knowledge.records r join knowledge.history h on h.record_id = r.id and h.version = 1
      where r.kind = 'feature' and h.reason like 'Imported:%'`,
  )
  return rows[0]
}
