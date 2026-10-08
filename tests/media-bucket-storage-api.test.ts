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
// T150: when the environment is absent this suite FAILS rather than skipping.
// It carries the acceptance criterion "rejected by the storage API", and a
// skip is that criterion unmet while the run reports green — which is exactly
// how T120 closed with a ticked box and nothing verified.
//
// T151: gated on "is this instance safe to write to", not "is it localhost"
// (tests/support/write-safe.ts). The old predicate's intent was right — these
// tests create real auth users and write real objects — but a Supabase branch
// has a remote hostname and would have skipped exactly as the sandbox did.
// The marker makes the answer explicit instead of guessed.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'
import { requireRunnable } from './support/runnable'
import { writeSafety } from './support/write-safe'

const SUPABASE_URL = process.env.SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY
const ANON_KEY = process.env.SUPABASE_ANON_KEY

const safety = writeSafety(process.env)
const RUNNABLE = requireRunnable({
  claim: 'the media bucket rejects a direct upload that bypasses the client module',
  available: safety.safe,
  remedy: `${safety.reason} Recipe in .env.local.example`,
})

const BUCKET = 'media'

describe.skipIf(!RUNNABLE)('T120 media bucket — storage API enforcement', () => {
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

    // `persistSession: false` is load-bearing, not tidiness. The suite runs
    // under jsdom, so two clients built with the same URL and key share one
    // localStorage under one default auth-storage key: B's sign-in silently
    // overwrote A's session and both clients acted as B. The cross-member
    // checks below then compared B against B — which is why they passed
    // review and failed the first time this suite actually executed.
    clientA = createClient(SUPABASE_URL!, ANON_KEY!, { auth: { persistSession: false } })
    const signInA = await clientA.auth.signInWithPassword({ email: emailA, password })
    if (signInA.error) throw signInA.error

    clientB = createClient(SUPABASE_URL!, ANON_KEY!, { auth: { persistSession: false } })
    const signInB = await clientB.auth.signInWithPassword({ email: emailB, password })
    if (signInB.error) throw signInB.error

    // The isolation the two checks below depend on. Assert it rather than
    // trusting it: if the sessions ever cross again, this says so directly
    // instead of turning a cross-member test into a same-member one.
    const [whoA, whoB] = await Promise.all([clientA.auth.getUser(), clientB.auth.getUser()])
    expect(whoA.data.user?.id).toBe(memberAId)
    expect(whoB.data.user?.id).toBe(memberBId)
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

  // #246 — the bucket's file list names every uploader (the top-level folders are
  // member ids). A public bucket serves a file by its URL with no read policy, so
  // listing is closed to everyone but the folder's own uploader.
  it('lists nothing to a signed-out caller, yet still serves a file by its public URL', async () => {
    const anon = createClient(SUPABASE_URL!, ANON_KEY!, { auth: { persistSession: false } })
    const root = await anon.storage.from(BUCKET).list('')
    expect(root.error).toBeNull()
    expect(root.data).toEqual([])
    const inFolder = await anon.storage.from(BUCKET).list(memberAId)
    expect(inFolder.data ?? []).toEqual([])
    const { data } = anon.storage.from(BUCKET).getPublicUrl(`${memberAId}/legit.webp`)
    const res = await fetch(data.publicUrl)
    expect(res.status).toBe(200)
  })

  it("lists nothing of another member's folder to a signed-in member", async () => {
    const root = await clientB.storage.from(BUCKET).list('')
    expect((root.data ?? []).map((f) => f.name)).not.toContain(memberAId)
    const theirs = await clientB.storage.from(BUCKET).list(memberAId)
    expect(theirs.data ?? []).toEqual([])
  })

  it('still lists, replaces and removes an uploader\'s own files', async () => {
    const own = await clientA.storage.from(BUCKET).list(memberAId)
    expect((own.data ?? []).map((f) => f.name)).toContain('legit.webp')
    const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])
    const again = await clientA.storage.from(BUCKET).upload(`${memberAId}/legit.webp`, webp, { contentType: 'image/webp', upsert: true })
    expect(again.error).toBeNull()
    const gone = await clientA.storage.from(BUCKET).remove([`${memberAId}/legit.webp`])
    expect(gone.error).toBeNull()
  })
})

