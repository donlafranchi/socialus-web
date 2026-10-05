// #363 — a Page's type (business or group) and its use case are changeable in
// settings (ruled 2026-10-05). The managing role follows the type
// (managingRoleForKind), so the founder's role swaps with it, or they lose their
// own Page. A business keeps a group_businesses row; one left behind by a change
// away is harmless and kept.

import { pageKindOf, presetOf, type PageKind, type UseCase } from '../../lib/groups/page-kind'
import { managingRoleForKind } from './constants'

type Client = { query: (sql: string, params?: unknown[]) => Promise<unknown> }

export async function applyTypeChange(
  client: Client,
  groupId: string,
  current: { kind: string; useCase: string | null },
  next: { kind?: PageKind; useCase?: UseCase },
): Promise<boolean> {
  const from = pageKindOf(current.kind)
  const to = next.kind ?? from
  const useCase = presetOf(to, next.useCase ?? (to === from ? current.useCase : null))
  if (to === current.kind && useCase === current.useCase) return false
  await client.query(`update public.groups set kind = $2, use_case = $3 where id = $1`, [groupId, to, useCase])
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
