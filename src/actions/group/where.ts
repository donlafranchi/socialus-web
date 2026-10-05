// #348 — where a Page is (Don, 2026-10-04): one question, three answers.
// Shared by group.update and group.update_draft; written in the caller's
// transaction. The location itself is anchor_location_id, set as before.

import { z } from 'zod'

export const whereInput = z.object({
  whereMode: z.enum(['visit', 'travel', 'roaming']).optional(),
  howToFind: z.string().max(140).nullable().optional(),
  usuallyAround: z.string().max(80).nullable().optional(),
  // I go to them: the towns served. Empty means the whole metro.
  serviceAreaPlaceIds: z.array(z.string().uuid()).max(40).optional(),
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
}
