// #363 — a Page's purpose, and its type, are changeable in settings (Don ruled
// A, 2026-10-05: purpose first, type for listing). A new purpose brings its
// type unless the owner names one. The managing role follows the type
// (managingRoleForKind), so the founder's role swaps with it, or they lose
// their own Page. A business keeps a group_businesses row; one left behind by a
// change away is harmless and kept.

import { pageKindOf, purposeOf, TYPE_FOR_PURPOSE, type PageKind, type Purpose } from '../../lib/groups/page-kind'
import { managingRoleForKind } from './constants'

type Client = { query: (sql: string, params?: unknown[]) => Promise<unknown> }

export async function applyTypeChange(
  client: Client,
  groupId: string,
  current: { kind: string; purpose: string | null },
  next: { kind?: PageKind; purpose?: Purpose },
): Promise<boolean> {
  const from = pageKindOf(current.kind)
  const purpose = next.purpose ?? purposeOf(current.kind, current.purpose)
  const to = next.kind ?? (next.purpose !== undefined && next.purpose !== current.purpose ? TYPE_FOR_PURPOSE[next.purpose] : from)
  if (to === current.kind && purpose === current.purpose) return false
  await client.query(`update public.groups set kind = $2, purpose = $3 where id = $1`, [groupId, to, purpose])
  const fromRole = managingRoleForKind(from)
  const toRole = managingRoleForKind(to)
  if (fromRole !== toRole) {
    await client.query(
      `update public.group_memberships set role = $2 where group_id = $1 and role = $3 and left_at is null`,
      [groupId, toRole, fromRole],
    )
  }
  if (to === 'business' && from !== 'business') {
    await client.query(
      `insert into public.group_businesses (group_id, display_name, public_description)
       select id, name, coalesce(description, '') from public.groups where id = $1
       on conflict (group_id) do nothing`,
      [groupId],
    )
  }
  return true
}
