// #348 — neighbourhood and town outlines for the owner's location map, as
// GeoJSON. Public boundary data (#347); simplified further for drawing.

import { NextResponse } from 'next/server'
import { withTransaction } from '@/actions/_lib/db'

// Read per request (no DB at build time); the CDN holds it a day.
export const dynamic = 'force-dynamic'

export async function GET() {
  const rows = await withTransaction(async (client) =>
    (
      await client.query<{ id: string; name: string; kind: string; geometry: string }>(
        `select p.id, p.display_name as name, p.kind,
                st_asgeojson(st_simplifypreservetopology(p.geography::geometry, 0.0002), 5) as geometry
           from public.places p
          where p.kind in ('city', 'neighborhood')
            and p.deleted_at is null and p.geography is not null`,
      )
    ).rows,
  )
  return NextResponse.json(
    {
      type: 'FeatureCollection',
      features: rows.map((r) => ({
        type: 'Feature',
        properties: { placeId: r.id, name: r.name, kind: r.kind },
        geometry: JSON.parse(r.geometry),
      })),
    },
    { headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=86400' } },
  )
}
