// #400 — the operator preview pass's privileged steps, here because Rule 1
// (T051) keeps the Supabase secret key and the database pool inside
// src/actions/_lib. Callers must have checked passEnabled() and tokenMatches().
//
// The limits are enforced by Supabase, not by anything the browser holds:
//   · a pass session's auth.sessions.not_after is 30 days out, so its refresh
//     token stops working then, on every surface (a security review found a
//     cookie-only check could be deleted or copied around);
//   · it is tagged with the token's fingerprint, and each pass sign-in deletes
//     every pass session for that account tagged with any other fingerprint —
//     so rotating the token and using the new link once ends the old ones.
// An access token already issued lives out its hour; nothing can shorten that.

import { createClient } from '@supabase/supabase-js'
import { getPool } from './db'

const DAYS = 30
export const PASS_TAG_PREFIX = 'preview-pass:'

export async function previewPassTokenHash(env: Record<string, string | undefined> = process.env): Promise<string | null> {
  if (env.VERCEL_ENV !== 'preview') return null
  const url = env.NEXT_PUBLIC_SUPABASE_URL
  const key = env.SUPABASE_SECRET_KEY
  const email = env.PREVIEW_PASS_EMAIL?.trim()
  if (!url || !key || !email) return null
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email })
  if (error || !data?.properties?.hashed_token) return null
  return data.properties.hashed_token
}

function claims(accessToken: string): { sessionId: string; userId: string } | null {
  try {
    const body = JSON.parse(Buffer.from(accessToken.split('.')[1]!, 'base64url').toString('utf8'))
    return typeof body.session_id === 'string' && typeof body.sub === 'string'
      ? { sessionId: body.session_id, userId: body.sub }
      : null
  } catch {
    return null
  }
}

/**
 * Stamp a fresh pass session (30 days, this token's tag) and end every pass
 * session from an older token. Returns false if it could not, after deleting
 * the new session, so the caller fails closed.
 */
export async function sealPreviewPassSession(accessToken: string, fingerprint: string): Promise<boolean> {
  const c = claims(accessToken)
  if (!c) return false
  const tag = PASS_TAG_PREFIX + fingerprint
  const pool = getPool()
  try {
    const res = await pool.query(
      `update auth.sessions set not_after = now() + make_interval(days => $3), tag = $2 where id = $1 and user_id = $4`,
      [c.sessionId, tag, DAYS, c.userId],
    )
    if (res.rowCount !== 1) throw new Error('session not found')
    await pool.query(
      `delete from auth.sessions where user_id = $1 and tag like $2 and tag <> $3`,
      [c.userId, PASS_TAG_PREFIX + '%', tag],
    )
    return true
  } catch {
    await pool.query(`delete from auth.sessions where id = $1`, [c.sessionId]).catch(() => {})
    return false
  }
}
