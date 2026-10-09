// #544 — what a staff member may do. The tables (staff_roles, staff_permissions,
// staff_role_permissions, staff_assignments) are the truth; this reads them.
// OPERATOR_MEMBER_ID stays as the owner's break-glass: it holds every permission
// with no database row, so a bad grant can never lock the owner out.
import { isOperator } from '@/actions/_lib/operator'

export const PERMISSIONS = [
  'metrics.view',
  'reports.review',
  'tags.review',
  'builders.manage',
  'unclaimed.manage',
  'staff.manage',
] as const
export type Permission = (typeof PERMISSIONS)[number]

type Queryable = { query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> }
type EnvLike = Record<string, string | undefined>

const known = (p: string): p is Permission => (PERMISSIONS as readonly string[]).includes(p)

/** Does this member hold this permission? A database error denies. */
export async function staffCan(db: Queryable, memberId: string | null | undefined, permission: Permission, env: EnvLike = process.env): Promise<boolean> {
  if (!memberId || memberId === 'self-bootstrap' || !known(permission)) return false
  if (isOperator(memberId, env)) return true
  try {
    const res = await db.query(
      `select exists (
         select 1 from public.staff_assignments a
           join public.staff_role_permissions rp on rp.role = a.role
          where a.member_id = $1 and a.revoked_at is null and rp.permission = $2
       ) as ok`,
      [memberId, permission],
    )
    return res.rows[0]?.ok === true
  } catch {
    return false
  }
}

/** Every permission this member holds. */
export async function permissionsOf(db: Queryable, memberId: string | null | undefined, env: EnvLike = process.env): Promise<Permission[]> {
  if (!memberId || memberId === 'self-bootstrap') return []
  if (isOperator(memberId, env)) return [...PERMISSIONS]
  try {
    const res = await db.query(
      `select distinct rp.permission from public.staff_assignments a
         join public.staff_role_permissions rp on rp.role = a.role
        where a.member_id = $1 and a.revoked_at is null`,
      [memberId],
    )
    return res.rows.map((r) => String(r.permission)).filter(known)
  } catch {
    return []
  }
}
