// T120 — storage-API-level enforcement for the `media` bucket.
//
// F061 review binding note 3: a direct upload bypassing the client module,
// with a valid member token, must be rejected BY THE STORAGE API — not by
// application code. That can only be proven against a real Supabase
// instance (RLS + bucket MIME/size restrictions are enforced server-side),
// so this suite is network-bound and follows the same local-only,
// skip-when-absent discipline as tests/rls-coverage.test.ts and
// scripts/bootstrap-eval-helpers.ts.
//
// Gated strictly on a LOCAL Supabase URL (127.0.0.1 / localhost), never a
// remote project — these tests write real objects and create real auth
// users, which rls-coverage.test.ts's own comment explicitly calls out as
// unsafe to point at a remote project (that suite is read-only; this one
// is not).
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1'])

function isLocal(url: string | undefined): url is string {
  if (!url) return false
  try {
    return LOCAL_HOSTS.has(new URL(url).hostname.toLowerCase())
  } catch {
    return false
  }
}

const SUPABASE_URL = process.env.SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY
const ANON_KEY = process.env.SUPABASE_ANON_KEY
const RUNNABLE = isLocal(SUPABASE_URL) && !!SERVICE_ROLE_KEY && !!ANON_KEY

const BUCKET = 'media'

describe.skipIf(!RUNNABLE)('T120 media bucket — storage API enforcement (local only)', () => {
  let admin: SupabaseClient
  let memberAId: string
  let memberBId: string
  let clientA: SupabaseClient
  let clientB: SupabaseClient
  const password = `T120-test-${randomUUID()}`

  beforeAll(async () => {
    admin = createClient(SUPABASE_URL!, SERVICE_ROLE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const emailA = `t120-a-${randomUUID()}@example.test`
    const emailB = `t120-b-${randomUUID()}@example.test`

    const { data: userA, error: errA } = await admin.auth.admin.createUser({
      email: emailA,
      password,
      email_confirm: true,
    })
    if (errA) throw errA
    memberAId = userA.user.id

    const { data: userB, error: errB } = await admin.auth.admin.createUser({
      email: emailB,
      password,
      email_confirm: true,
    })
    if (errB) throw errB
    memberBId = userB.user.id

    clientA = createClient(SUPABASE_URL!, ANON_KEY!)
    const signInA = await clientA.auth.signInWithPassword({ email: emailA, password })
    if (signInA.error) throw signInA.error

    clientB = createClient(SUPABASE_URL!, ANON_KEY!)
    const signInB = await clientB.auth.signInWithPassword({ email: emailB, password })
    if (signInB.error) throw signInB.error
  })

  afterAll(async () => {
    // Best-effort cleanup — do not fail the suite on cleanup errors.
    try {
      await admin.storage.from(BUCKET).remove([
        `${memberAId}/reject-jpeg.jpg`,
        `${memberAId}/reject-svg.svg`,
        `${memberAId}/reject-large.webp`,
        `${memberAId}/legit.webp`,
        `${memberBId}/cross-member.webp`,
      ])
      if (memberAId) await admin.auth.admin.deleteUser(memberAId)
      if (memberBId) await admin.auth.admin.deleteUser(memberBId)
    } catch {
      // ignore
    }
  })

  it('rejects a raw JPEG upload — allowed_mime_types is image/webp only', async () => {
    const jpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0])
    const { error } = await clientA.storage
      .from(BUCKET)
      .upload(`${memberAId}/reject-jpeg.jpg`, jpegBytes, { contentType: 'image/jpeg' })
    expect(error).not.toBeNull()
  })

  it('rejects an SVG upload', async () => {
    const svgBytes = new TextEncoder().encode('<svg onload="alert(1)"></svg>')
    const { error } = await clientA.storage
      .from(BUCKET)
      .upload(`${memberAId}/reject-svg.svg`, svgBytes, { contentType: 'image/svg+xml' })
    expect(error).not.toBeNull()
  })

  it('rejects a file over the 5MB limit', async () => {
    const oversized = new Uint8Array(6 * 1024 * 1024)
    const { error } = await clientA.storage
      .from(BUCKET)
      .upload(`${memberAId}/reject-large.webp`, oversized, { contentType: 'image/webp' })
    expect(error).not.toBeNull()
  })

  it('rejects Member A writing under Member B\'s path prefix', async () => {
    const webpBytes = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])
    const { error } = await clientA.storage
      .from(BUCKET)
      .upload(`${memberBId}/cross-member.webp`, webpBytes, { contentType: 'image/webp' })
    expect(error).not.toBeNull()
  })

  it('accepts a real WebP upload under the uploader\'s own prefix', async () => {
    const webpBytes = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])
    const { error } = await clientA.storage
      .from(BUCKET)
      .upload(`${memberAId}/legit.webp`, webpBytes, { contentType: 'image/webp' })
    expect(error).toBeNull()
  })
})
