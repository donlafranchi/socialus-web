// #544 — the server-action door: a handler asks for a permission by name. The
// message is the same for every refusal, so an unauthorised caller learns nothing
// about what exists. Fails closed: a database error is a refusal.
import { AuthorizationError } from './errors'
import { getPool } from './db'
import { isOperator } from './operator'
import { staffCan, type Permission } from '@/lib/staff/permissions'
import type { ActionContext } from './context'

export async function requirePermission(ctx: ActionContext, permission: Permission, verb: string): Promise<string> {
  // The owner's break-glass needs no database; everyone else is decided by the role tables.
  if (isOperator(ctx.actingMemberId)) return ctx.actingMemberId as string
  let ok = false
  try {
    ok = await staffCan({ query: (sql, params) => getPool().query(sql, params) }, ctx.actingMemberId, permission)
  } catch {
    ok = false
  }
  if (!ok) throw new AuthorizationError(`${verb}: not permitted`)
  return ctx.actingMemberId as string
}
