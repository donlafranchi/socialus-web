// Supabase Auth `before-user-created` hook receiver.
// Docs: https://supabase.com/docs/guides/auth/auth-hooks/before-user-created-hook
//
// Runs BEFORE the auth.users row is written. Supabase POSTs
// { metadata, user } signed per the Standard Webhooks spec. Responding 200
// with `{}` admits the signup; responding 4xx with `{ error: { ... } }`
// rejects it and surfaces `message` to the client.
//
// Distinct from /api/internal/auth-signup, which fires AFTER the row exists
// (pg_net trigger, custom HMAC header) and creates the Member. This route
// only decides admission — it writes nothing.
//
// action-layer:exempt — POST performs no writes; it is a pure admission
// decision. See scripts/action-layer-exemptions.json.

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { verifyStandardWebhook } from '@/lib/standard-webhook'
import { evaluateSignupPolicy } from '@/lib/signup-policy'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const payloadSchema = z.object({
  metadata: z
    .object({
      uuid: z.string().optional(),
      time: z.string().optional(),
      name: z.string().optional(),
      ip_address: z.string().optional(),
    })
    .passthrough()
    .optional(),
  user: z
    .object({
      id: z.string().optional(),
      email: z.string().optional().nullable(),
      phone: z.string().optional().nullable(),
      is_anonymous: z.boolean().optional(),
    })
    .passthrough(),
})

/** Reject: blocks the signup and shows `message` to the person signing up. */
function reject(httpCode: number, message: string) {
  return NextResponse.json({ error: { http_code: httpCode, message } }, { status: httpCode })
}

/** Admit: empty object + 200 is the documented "proceed" response. */
function admit() {
  return NextResponse.json({}, { status: 200 })
}

export async function POST(req: NextRequest) {
  const secret = process.env.AUTH_BEFORE_USER_CREATED_HOOK_SECRET
  if (!secret) {
    // Unconfigured is a deployment error, not a policy verdict. Refuse rather
    // than silently admitting everyone through an unauthenticated endpoint.
    console.error('[before-user-created] AUTH_BEFORE_USER_CREATED_HOOK_SECRET not set')
    return reject(500, 'Sign-up is temporarily unavailable. Please try again shortly.')
  }

  // Body must be read as raw text — the signature covers these exact bytes.
  const bodyText = await req.text()

  const verified = verifyStandardWebhook({
    body: bodyText,
    secret,
    webhookId: req.headers.get('webhook-id'),
    webhookTimestamp: req.headers.get('webhook-timestamp'),
    webhookSignature: req.headers.get('webhook-signature'),
  })
  if (!verified.valid) {
    console.warn('[before-user-created] signature rejected:', verified.reason)
    return reject(401, 'Unauthorized.')
  }

  try {
    const parsed = payloadSchema.safeParse(JSON.parse(bodyText))
    if (!parsed.success) {
      // A signed-but-unparseable payload means the hook contract moved.
      // Admit rather than block every signup on a schema surprise.
      console.error('[before-user-created] payload did not match schema:', parsed.error.message)
      return admit()
    }

    const decision = evaluateSignupPolicy(parsed.data.user)
    if (!decision.allow) {
      console.info('[before-user-created] rejected signup:', decision.reason)
      return reject(decision.httpCode, decision.message)
    }
    return admit()
  } catch (err) {
    // Fail open on unexpected errors: a bug in policy evaluation must not
    // take signup offline. Signature failures above still fail closed.
    console.error('[before-user-created] unexpected error, admitting signup:', err)
    return admit()
  }
}

export async function GET() {
  return NextResponse.json({ error: 'method_not_allowed' }, { status: 405 })
}
