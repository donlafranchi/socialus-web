// Page types (ruled 2026-10-05): Business or Social group, changeable in
// settings. The managing role follows the kind (managingRoleForKind), so the
// founder's role swaps with it, or they lose their own Page. A business keeps a
// group_businesses row; one left behind by a change away is harmless and kept.

import { pageKindOf, storedKindFor, type PageKind } from '../../lib/groups/page-kind'
import { managingRoleForKind, type GroupKind } from './constants'

type Client = { query: (sql: string, params?: unknown[]) => Promise<unknown> }

export async function applyKindChange(client: Client, groupId: string, stored: string, next: PageKind): Promise<boolean> {
  if (pageKindOf(stored) === next) return false
  const to = storedKindFor(next, stored)
  const fromRole = managingRoleForKind(stored as GroupKind)
  const toRole = managingRoleForKind(to)
  await client.query(`update public.groups set kind = $2 where id = $1`, [groupId, to])
  if (fromRole !== toRole) {
    await client.query(
      `update public.group_memberships set role = $2 where group_id = $1 and role = $3 and left_at is null`,
      [groupId, toRole, fromRole],
    )
  }
  if (to === 'business') {
    await client.query(
      `insert into public.group_businesses (group_id, display_name, public_description)
       select id, name, coalesce(description, '') from public.groups where id = $1
       on conflict (group_id) do nothing`,
      [groupId],
    )
  }
  return true
}
