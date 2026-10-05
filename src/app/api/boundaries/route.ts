// #348 — neighbourhood and town outlines for the owner's location map, as
// GeoJSON. Public boundary data (#347); simplified further for drawing.

import { NextResponse } from 'next/server'
import { withTransaction } from '@/actions/_lib/db'

export const revalidate = 86_400

const MSA = /^\d{5}$/

export async function GET(req: Request) {
  const msa = new URL(req.url).searchParams.get('msa') ?? '40900'
  if (!MSA.test(msa)) return NextResponse.json({ error: 'msa must be five digits' }, { status: 400 })
  const rows = await withTransaction(async (client) =>
    (
      await client.query<{ id: string; name: string; kind: string; geometry: string }>(
        `select p.id, p.display_name as name, p.kind,
                st_asgeojson(st_simplifypreservetopology(p.geography::geometry, 0.0002), 5) as geometry
           from public.places p
          where p.msa_code = $1 and p.kind in ('city', 'neighborhood')
            and p.deleted_at is null and p.geography is not null`,
        [msa],
      )
    ).rows,
  )
  return NextResponse.json({
    type: 'FeatureCollection',
    features: rows.map((r) => ({
      type: 'Feature',
      properties: { placeId: r.id, name: r.name, kind: r.kind },
      geometry: JSON.parse(r.geometry),
    })),
  })
}
