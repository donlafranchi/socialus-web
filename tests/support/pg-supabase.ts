// A Supabase client stand-in that answers from the real database through pg, for tests that drive a server
// action end to end (screen → action → handler → database) without a running PostgREST. It covers only what the
// signup path calls: auth.getUser / updateUser, rpc(fn, args), and from(t).select(cols).eq(col, v).maybeSingle().

import type { PoolClient } from 'pg'

const IDENT = /^[a-z_][a-z0-9_]*$/
const ident = (s: string) => {
  if (!IDENT.test(s)) throw new Error(`pg-supabase: not an identifier: ${s}`)
  return s
}

export function pgSupabase(client: PoolClient, user: () => { id: string } | null) {
  return {
    auth: {
      getUser: async () => ({ data: { user: user() }, error: null }),
      updateUser: async () => ({ data: {}, error: null }),
    },
    rpc: async (fn: string, args: Record<string, unknown> = {}) => {
      const names = Object.keys(args)
      const sql = `select public.${ident(fn)}(${names.map((n, i) => `${ident(n)} => $${i + 1}`).join(', ')}) as v`
      try {
        return { data: (await client.query(sql, Object.values(args))).rows[0]?.v ?? null, error: null }
      } catch (err) {
        return { data: null, error: { message: (err as Error).message } }
      }
    },
    from: (table: string) => ({
      select: (cols: string) => ({
        eq: (col: string, value: unknown) => ({
          maybeSingle: async () => {
            const list = cols.split(',').map((c) => ident(c.trim())).join(', ')
            const rows = (await client.query(`select ${list} from public.${ident(table)} where ${ident(col)} = $1 limit 1`, [value])).rows
            return { data: rows[0] ?? null, error: null }
          },
        }),
      }),
    }),
  }
}
