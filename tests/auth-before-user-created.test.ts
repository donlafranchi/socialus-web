import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createHmac, randomBytes } from 'node:crypto'
import { verifyStandardWebhook } from '@/lib/standard-webhook'
import { evaluateSignupPolicy } from '@/lib/signup-policy'

const KEY = randomBytes(24)
const SECRET = `v1,whsec_${KEY.toString('base64')}`

function sign(id: string, ts: number, body: string, key = KEY): string {
  return `v1,${createHmac('sha256', key).update(`${id}.${ts}.${body}`, 'utf8').digest('base64')}`
}

describe('verifyStandardWebhook', () => {
  const body = JSON.stringify({ user: { email: 'a@b.com' } })
  const id = 'msg_123'
  const now = 1_800_000_000

  it('accepts a correctly signed payload', () => {
    const r = verifyStandardWebhook({
      body,
      secret: SECRET,
      webhookId: id,
      webhookTimestamp: String(now),
      webhookSignature: sign(id, now, body),
      nowSeconds: now,
    })
    expect(r.valid).toBe(true)
  })

  it('rejects a tampered body', () => {
    const r = verifyStandardWebhook({
      body: body.replace('a@b.com', 'evil@b.com'),
      secret: SECRET,
      webhookId: id,
      webhookTimestamp: String(now),
      webhookSignature: sign(id, now, body),
      nowSeconds: now,
    })
    expect(r).toEqual({ valid: false, reason: 'no_match' })
  })

  it('rejects a signature made with the wrong key', () => {
    const r = verifyStandardWebhook({
      body,
      secret: SECRET,
      webhookId: id,
      webhookTimestamp: String(now),
      webhookSignature: sign(id, now, body, randomBytes(24)),
      nowSeconds: now,
    })
    expect(r).toEqual({ valid: false, reason: 'no_match' })
  })

  it('rejects a replayed timestamp outside tolerance', () => {
    const old = now - 3600
    const r = verifyStandardWebhook({
      body,
      secret: SECRET,
      webhookId: id,
      webhookTimestamp: String(old),
      webhookSignature: sign(id, old, body),
      nowSeconds: now,
    })
    expect(r).toEqual({ valid: false, reason: 'stale_timestamp' })
  })

  it('rejects missing headers', () => {
    const r = verifyStandardWebhook({
      body,
      secret: SECRET,
      webhookId: null,
      webhookTimestamp: String(now),
      webhookSignature: sign(id, now, body),
      nowSeconds: now,
    })
    expect(r).toEqual({ valid: false, reason: 'missing_headers' })
  })

  it('rejects an empty secret', () => {
    const r = verifyStandardWebhook({
      body,
      secret: '',
      webhookId: id,
      webhookTimestamp: String(now),
      webhookSignature: sign(id, now, body),
      nowSeconds: now,
    })
    expect(r).toEqual({ valid: false, reason: 'bad_secret' })
  })

  it('accepts either secret during rotation (pipe-separated)', () => {
    const oldKey = randomBytes(24)
    const r = verifyStandardWebhook({
      body,
      secret: `v1,whsec_${oldKey.toString('base64')}|${SECRET}`,
      webhookId: id,
      webhookTimestamp: String(now),
      webhookSignature: sign(id, now, body),
      nowSeconds: now,
    })
    expect(r.valid).toBe(true)
  })

  it('accepts a header carrying multiple space-delimited signatures', () => {
    const r = verifyStandardWebhook({
      body,
      secret: SECRET,
      webhookId: id,
      webhookTimestamp: String(now),
      webhookSignature: `v1,bogussignature ${sign(id, now, body)}`,
      nowSeconds: now,
    })
    expect(r.valid).toBe(true)
  })
})

describe('evaluateSignupPolicy', () => {
  it('allows an ordinary address', () => {
    expect(evaluateSignupPolicy({ email: 'don@example.com' }, {})).toEqual({ allow: true })
  })

  it('allows phone-only and anonymous signups', () => {
    expect(evaluateSignupPolicy({ email: '', phone: '+15550001111' }, {})).toEqual({ allow: true })
    expect(evaluateSignupPolicy({ is_anonymous: true }, {})).toEqual({ allow: true })
  })

  it('blocks a known disposable domain, case-insensitively', () => {
    const r = evaluateSignupPolicy({ email: 'Throwaway@MAILINATOR.com' }, {})
    expect(r.allow).toBe(false)
    if (!r.allow) expect(r.reason).toBe('disposable_email')
  })

  it('blocks a domain added via env', () => {
    const r = evaluateSignupPolicy(
      { email: 'x@spammy.test' },
      { SIGNUP_BLOCKED_EMAIL_DOMAINS: 'spammy.test, other.test' },
    )
    expect(r.allow).toBe(false)
    if (!r.allow) expect(r.reason).toBe('disposable_email')
  })

  it('enforces an allowlist when one is set', () => {
    const env = { SIGNUP_ALLOWED_EMAIL_DOMAINS: 'example.com' }
    expect(evaluateSignupPolicy({ email: 'a@example.com' }, env)).toEqual({ allow: true })
    const r = evaluateSignupPolicy({ email: 'a@elsewhere.com' }, env)
    expect(r.allow).toBe(false)
    if (!r.allow) expect(r.reason).toBe('domain_not_allowed')
  })

  it('rejects a malformed address', () => {
    const r = evaluateSignupPolicy({ email: 'not-an-email' }, {})
    expect(r.allow).toBe(false)
    if (!r.allow) expect(r.reason).toBe('malformed_email')
  })
})

describe('POST /api/internal/auth-before-user-created', () => {
  const payload = (email: string) =>
    JSON.stringify({
      metadata: {
        uuid: 'u',
        time: '2026-08-31T00:00:00Z',
        name: 'before-user-created',
        ip_address: '127.0.0.1',
      },
      user: {
        id: 'ff7fc9ae-3b1b-4642-9241-64adb9848a03',
        aud: 'authenticated',
        role: '',
        email,
        phone: '',
        app_metadata: { provider: 'email', providers: ['email'] },
        user_metadata: {},
        identities: [],
        created_at: '0001-01-01T00:00:00Z',
        updated_at: '0001-01-01T00:00:00Z',
        is_anonymous: false,
      },
    })

  function post(body: string, opts: { sign?: boolean } = {}) {
    const msgId = 'msg_e2e'
    const ts = Math.floor(Date.now() / 1000)
    return new Request('http://localhost:3000/api/internal/auth-before-user-created', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'webhook-id': msgId,
        'webhook-timestamp': String(ts),
        'webhook-signature': opts.sign === false ? 'v1,wrong' : sign(msgId, ts, body),
      },
      body,
    })
  }

  async function handler() {
    const mod = await import('@/app/api/internal/auth-before-user-created/route')
    return mod.POST
  }

  beforeEach(() => {
    vi.stubEnv('AUTH_BEFORE_USER_CREATED_HOOK_SECRET', SECRET)
    vi.stubEnv('SIGNUP_BLOCKED_EMAIL_DOMAINS', '')
    vi.stubEnv('SIGNUP_ALLOWED_EMAIL_DOMAINS', '')
  })

  it('admits a good signup with 200 and an empty object', async () => {
    const POST = await handler()
    const res = await POST(post(payload('don@example.com')) as never)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({})
  })

  it('rejects a disposable domain in the documented error shape', async () => {
    const POST = await handler()
    const res = await POST(post(payload('x@mailinator.com')) as never)
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error.http_code).toBe(403)
    expect(typeof body.error.message).toBe('string')
  })

  it('rejects an unsigned or wrongly signed request with 401', async () => {
    const POST = await handler()
    const res = await POST(post(payload('don@example.com'), { sign: false }) as never)
    expect(res.status).toBe(401)
  })

  it('refuses rather than admitting when the hook secret is unset', async () => {
    vi.stubEnv('AUTH_BEFORE_USER_CREATED_HOOK_SECRET', '')
    const POST = await handler()
    const res = await POST(post(payload('don@example.com')) as never)
    expect(res.status).toBe(500)
  })
})
