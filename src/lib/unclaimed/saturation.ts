// #987 — the seeder steps back from a town that runs itself (2026-10-21): no new seeded Page in a town where
// this many claimed Pages have posted within this many days. Mirrored in scripts/unclaimed/THEMES.md.
export const TOWN_SATURATION = { claimedPages: 5, withinDays: 30 } as const

type Db = { query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> }

/** City names (as in `places`) where enough claimed Pages are posting their own news. */
export async function saturatedTowns(db: Db, now: Date = new Date(), rule = TOWN_SATURATION): Promise<Set<string>> {
  const { rows } = await db.query(
    `select c.display_name as town
       from public.places c
       join public.locations l on l.deleted_at is null and st_intersects(c.geography, l.geography)
       join public.groups g on g.anchor_location_id = l.id
      where c.kind = 'city' and c.deleted_at is null and g.claimed_at is not null
        and exists (select 1 from public.page_posts p
                     where p.group_id = g.id and p.sample_kind is null and p.dissolved_at is null
                       and p.created_at > $1::timestamptz - make_interval(days => $2))
      group by c.display_name
     having count(distinct g.id) >= $3`,
    [now, rule.withinDays, rule.claimedPages],
  )
  return new Set(rows.map((r) => r.town as string))
}

/** Splits the planned Pages: a Page already made is always kept (its own run keeps it current); a new one in a full town is held. */
export function holdSaturated<P extends { city: string; publicInfoUrl: string; legacyUrl?: string }>(planned: P[], full: Set<string>, known: Set<string>) {
  const isKnown = (p: P) => known.has(p.publicInfoUrl) || (p.legacyUrl ? known.has(p.legacyUrl) : false)
  return {
    load: planned.filter((p) => isKnown(p) || !full.has(p.city)),
    held: planned.filter((p) => !isKnown(p) && full.has(p.city)),
  }
}
