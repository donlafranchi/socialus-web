// Can a signed-in member read? (PostgREST rejected every signed-in token
// from 2026-11-13 for three days while every signed-out check stayed green.)
// Signs in as the builder member and makes the reads Explore makes with that
// member's token. Explore swallows these errors and renders an empty 200, so
// only a direct read can tell. Read-only.
//
//   BUILDER_SEED=… SUPABASE_URL=… SUPABASE_PUBLISHABLE_KEY=… npx tsx scripts/signed-in-check.ts
//
// Exit 0 = the reads worked. Exit 1 = the reason is printed and appended to $UPTIME_OUT.

import { appendFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { builderEmail, builderPassword } from '../src/lib/builders/credentials'

async function check(): Promise<string | null> {
  const seed = process.env.BUILDER_SEED ?? ''
  const url = process.env.SUPABASE_URL ?? ''
  const key = process.env.SUPABASE_PUBLISHABLE_KEY ?? ''
  if (!seed || !url || !key) return 'BUILDER_SEED, SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY is not set'

  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: auth, error: signInError } = await sb.auth.signInWithPassword({
    email: builderEmail('member'),
    password: builderPassword(seed, 'member'),
  })
  if (signInError || !auth.user) return `sign-in failed: ${signInError?.message ?? 'no user'}`

  const own = await sb.from('members').select('id').eq('id', auth.user.id).maybeSingle()
  if (own.error) return `signed-in read "own member row" failed: ${own.error.message}`
  if (!own.data) return 'signed-in read "own member row" returned nothing'
  const interests = await sb.from('member_interests').select('tag').eq('member_id', auth.user.id)
  if (interests.error) return `signed-in read "member interests" failed: ${interests.error.message}`
  return null
}

check().then(
  (reason) => {
    if (!reason) return console.log('up:   signed-in reads')
    console.log(`DOWN: signed-in reads: ${reason}`)
    if (process.env.UPTIME_OUT) appendFileSync(process.env.UPTIME_OUT, `signed-in reads — ${reason}\n`)
    process.exit(1)
  },
  (e) => {
    console.log(`DOWN: signed-in reads: ${(e as Error).message}`)
    if (process.env.UPTIME_OUT) appendFileSync(process.env.UPTIME_OUT, `signed-in reads — ${(e as Error).message}\n`)
    process.exit(1)
  },
)
