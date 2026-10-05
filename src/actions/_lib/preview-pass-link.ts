// #400 — the operator preview pass's one privileged step: a one-time sign-in
// token for PREVIEW_PASS_EMAIL, minted with the Supabase secret key. Here
// because Rule 1 (T051) keeps that key inside src/actions/_lib. Nothing is
// emailed; the caller redeems the token at once. Callers must have checked
// passEnabled() and tokenMatches() first — this refuses off a preview anyway.

import { createClient } from '@supabase/supabase-js'

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
