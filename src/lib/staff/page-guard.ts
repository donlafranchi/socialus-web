// #544 — the page door: /admin/* pages ask for a permission by name and a member
// without it gets the same 404 as an address that does not exist, so the URL
// does not reveal itself. Once per request (React cache), so the layout and the
// page share one lookup.
import { cache } from 'react'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import { getPool } from '@/actions/_lib/db'
import { permissionsOf, type Permission } from './permissions'

export const staffPermissions = cache(async (): Promise<{ memberId: string | null; permissions: Permission[] }> => {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  const memberId = data.user?.id ?? null
  let permissions: Permission[] = []
  try {
    // The pool is touched only when the member is not the owner (the owner needs no database).
    permissions = await permissionsOf({ query: (sql, params) => getPool().query(sql, params) }, memberId)
  } catch {
    permissions = []
  }
  return { memberId, permissions }
})

/** Returns the member id, or 404s. */
export async function requirePagePermission(permission: Permission): Promise<string> {
  const { memberId, permissions } = await staffPermissions()
  if (!memberId || !permissions.includes(permission)) notFound()
  return memberId as string
}
