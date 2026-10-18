// #348 — where a Page is (Don, 2026-10-04): one question, three answers.
// #896 — six answers (Don, 2026-10-18), and a Page's stops: its locations, or
// its where-and-when list.
// Shared by group.update and group.update_draft; written in the caller's
// transaction. The location itself is anchor_location_id, set as before.

import { z } from 'zod'

export const whereInput = z.object({
  whereMode: z.enum(['visit', 'landmark', 'multi', 'roaming', 'travel', 'online']).optional(),
  howToFind: z.string().max(140).nullable().optional(),
  usuallyAround: z.string().max(80).nullable().optional(),
  // I go to them: the towns served. Empty means the whole metro.
  serviceAreaPlaceIds: z.array(z.string().uuid()).max(40).optional(),
  // More than one location (one address each), or it moves (where and when).
  stops: z.array(z.object({ label: z.string().max(120), whenText: z.string().max(80).nullable() })).max(20).optional(),
})
export type WhereInput = z.infer<typeof whereInput>

export type WhereClause = 'where_mode = $' | 'how_to_find = $' | 'usually_around = $'

const note = (v: string | null) => (v === null || v.trim() === '' ? null : v.trim())

export async function applyWhere(
  client: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
  groupId: string,
  input: WhereInput,
  fragments: { clause: string; value: unknown }[],
  patched: string[],
): Promise<void> {
  if (input.whereMode !== undefined) {
    fragments.push({ clause: 'where_mode = $', value: input.whereMode })
    patched.push('where_mode')
  }
  if (input.howToFind !== undefined) {
    fragments.push({ clause: 'how_to_find = $', value: note(input.howToFind) })
    patched.push('how_to_find')
  }
  if (input.usuallyAround !== undefined) {
    fragments.push({ clause: 'usually_around = $', value: note(input.usuallyAround) })
    patched.push('usually_around')
  }
  if (input.serviceAreaPlaceIds !== undefined) {
    const ids = [...new Set(input.serviceAreaPlaceIds)]
    await client.query(`delete from public.page_service_areas where group_id = $1`, [groupId])
    if (ids.length > 0) {
      // Only real towns and neighbourhoods count; anything else is dropped.
      await client.query(
        `insert into public.page_service_areas (group_id, place_id)
         select $1, p.id from public.places p
          where p.id = any($2::uuid[]) and p.kind in ('city', 'neighborhood') and p.deleted_at is null
         on conflict do nothing`,
        [groupId, ids],
      )
    }
    patched.push('service_areas')
  }
  if (input.stops !== undefined) {
    const stops = input.stops.flatMap((s) => (s.label.trim() ? [{ label: s.label.trim(), whenText: note(s.whenText) }] : []))
    await client.query(`delete from public.page_stops where group_id = $1`, [groupId])
    if (stops.length > 0) {
      await client.query(
        `insert into public.page_stops (group_id, position, label, when_text)
         select $1, (o - 1)::smallint, l, w from unnest($2::text[], $3::text[]) with ordinality as t(l, w, o)`,
        [groupId, stops.map((s) => s.label), stops.map((s) => s.whenText)],
      )
    }
    patched.push('stops')
  }
}
