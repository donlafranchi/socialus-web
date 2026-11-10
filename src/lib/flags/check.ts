// #1227 The server-side flag check. Once per request per flag (React cache).
// Fails closed: no database, or any error, means the flag is off for everyone,
// builders included, so a broken lookup can never show unfinished work.
import { cache } from 'react'
import { createClient } from '@/lib/supabase-server'
import { getPool } from '@/actions/_lib/db'
import { isOperator } from '@/actions/_lib/operator'
import type { FlagKey } from './registry'
import { resolveFlag } from './resolve'

type Query = (sql: string, params: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>

/** The lookup, separate from the request so it can be tested with any member. */
export async function flagOnFor(key: string, memberId: string | null, query: Query): Promise<boolean> {
  try {
    const { rows } = await query(
      `select (select f.audience from public.feature_flags f where f.key = $1) as audience,
              exists (select 1 from public.builders b
                       where b.member_id = $2::uuid and b.disabled_at is null) as builder`,
      [key, memberId],
    )
    const row = rows[0] ?? {}
    return resolveFlag(row.audience as string | null, {
      builder: row.builder === true,
      operator: isOperator(memberId),
    })
  } catch {
    return false
  }
}

export const flagOn = cache(async (key: FlagKey): Promise<boolean> => {
  let memberId: string | null = null
  try {
    const supabase = await createClient()
    memberId = (await supabase.auth.getUser()).data.user?.id ?? null
  } catch {
    memberId = null
  }
  return flagOnFor(key, memberId, (sql, params) => getPool().query(sql, params))
})
