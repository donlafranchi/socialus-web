// #413 — "Or type a neighbourhood": the metro's neighbourhoods by name, each
// with the point the pin starts on before the owner drags it to the door.

import type { PoolClient } from 'pg'

export interface NeighborhoodMatch {
  placeId: string
  name: string
  centroid: [number, number]
}

export async function searchNeighborhoods(client: Pick<PoolClient, 'query'>, query: string, msa = '40900'): Promise<NeighborhoodMatch[]> {
  const q = query.trim()
  if (!q) return []
  const res = await client.query<{ id: string; name: string; lng: number; lat: number }>(
    `select p.id, p.display_name as name, st_x(c) as lng, st_y(c) as lat
       from public.places p,
            lateral (select coalesce(p.centroid::geometry, st_pointonsurface(p.geography::geometry)) as c) pt
      where p.kind = 'neighborhood' and p.msa_code = $2 and p.deleted_at is null and pt.c is not null
        and strpos(lower(p.display_name), lower($1)) > 0
      order by strpos(lower(p.display_name), lower($1)) = 1 desc, p.display_name
      limit 8`,
    [q, msa],
  )
  return res.rows.map((r) => ({ placeId: r.id, name: r.name, centroid: [Number(r.lng.toFixed(6)), Number(r.lat.toFixed(6))] }))
}
