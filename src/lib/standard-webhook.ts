// Standard Webhooks signature verification (https://www.standardwebhooks.com/).
//
// Supabase Auth HTTP Hooks sign every request per this spec. Three headers
// arrive with the POST:
//   webhook-id         unique delivery id
//   webhook-timestamp  UNIX seconds
//   webhook-signature  space-separated list of "v1,<base64-sig>"
//
// The signed content is `{id}.{timestamp}.{rawBody}` — HMAC-SHA256 with the
// base64-decoded secret, base64-encoded. The configured secret arrives as
// `v1,whsec_<base64>`; only the <base64> part is the key material.
//
// Implemented here rather than pulling the `standardwebhooks` package: it is
// ~40 lines, and the dependency would be the only runtime dep added for one
// route.

import { createHmac, timingSafeEqual } from 'node:crypto'

const DEFAULT_TOLERANCE_SECONDS = 300

export interface VerifyInput {
  /** Raw request body — the exact bytes received, not a re-serialized object. */
  body: string
  /** Configured secret(s). `v1,whsec_<b64>`; multiple separated by `|` for rotation. */
  secret: string
  webhookId: string | null
  webhookTimestamp: string | null
  webhookSignature: string | null
  /** Replay window in seconds. */
  toleranceSeconds?: number
  /** Injectable for tests. Seconds since epoch. */
  nowSeconds?: number
}

export type VerifyResult =
  | { valid: true }
  | { valid: false; reason: 'missing_headers' | 'bad_secret' | 'stale_timestamp' | 'no_match' }

/** Strip the `v1,whsec_` prefix and base64-decode. Returns null if unusable. */
function toKey(secret: string): Buffer | null {
  const trimmed = secret.trim()
  if (!trimmed) return null
  // Tolerate a raw base64 secret without the versioned prefix.
  const base64 = trimmed.replace(/^v\d+,/, '').replace(/^whsec_/, '')
  if (!base64) return null
  const key = Buffer.from(base64, 'base64')
  return key.length > 0 ? key : null
}

function constantTimeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8')
  const bufB = Buffer.from(b, 'utf8')
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

export function verifyStandardWebhook(input: VerifyInput): VerifyResult {
  const { body, secret, webhookId, webhookTimestamp, webhookSignature } = input
  if (!webhookId || !webhookTimestamp || !webhookSignature) {
    return { valid: false, reason: 'missing_headers' }
  }

  const keys = secret
    .split('|')
    .map(toKey)
    .filter((k): k is Buffer => k !== null)
  if (keys.length === 0) return { valid: false, reason: 'bad_secret' }

  const ts = Number.parseInt(webhookTimestamp, 10)
  if (!Number.isFinite(ts)) return { valid: false, reason: 'stale_timestamp' }
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000)
  const tolerance = input.toleranceSeconds ?? DEFAULT_TOLERANCE_SECONDS
  if (Math.abs(now - ts) > tolerance) return { valid: false, reason: 'stale_timestamp' }

  const signedContent = `${webhookId}.${webhookTimestamp}.${body}`
  const expected = keys.map((key) =>
    createHmac('sha256', key).update(signedContent, 'utf8').digest('base64'),
  )

  // Header carries one or more space-delimited "v1,<sig>" entries.
  const provided = webhookSignature
    .split(' ')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => (part.includes(',') ? part.slice(part.indexOf(',') + 1) : part))

  for (const candidate of provided) {
    for (const exp of expected) {
      if (constantTimeEqual(candidate, exp)) return { valid: true }
    }
  }
  return { valid: false, reason: 'no_match' }
}
