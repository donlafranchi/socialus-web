// T043 — Action context resolver
// Source: development/tickets/done/T043-* § action-context.ts
//
// Builds an ActionContext from a Next.js Request. Used by route handlers
// (T044 wires the auth-signup route). For most routes, actingMemberId comes
// from the authenticated user's Supabase session. For the auth-signup hook,
// actingMemberId is the 'self-bootstrap' sentinel until member.create
// resolves it to the freshly-inserted member id.

import type { PoolClient } from 'pg'
import { makeContext, type ActionContext, type ActingMemberId } from '@/actions/_lib/context'

export interface ResolveContextOptions {
  actingMemberId: ActingMemberId
  viaDelegationId?: string | null
}

// Sentinel PoolClient that throws on any access. Handlers MUST go through
// withTransaction which provides a real transaction-bound client; the
// route-layer ctx.db is a placeholder for type safety, never read.
const SENTINEL_DB: PoolClient = new Proxy({} as PoolClient, {
  get(_target, prop) {
    throw new Error(
      `ActionContext.db: handlers must use withTransaction; the route-layer db is a sentinel (attempted access: ${String(prop)})`,
    )
  },
})

// Resolve an action context for a route invocation. The caller passes the
// actingMemberId (resolved from auth.uid() on a normal route, or
// 'self-bootstrap' on the auth-signup hook).
//
// Note: ctx.db is a sentinel — handlers MUST use withTransaction. This
// keeps the route-layer free of pool-client lifecycle concerns.
export function resolveActionContext(opts: ResolveContextOptions): ActionContext {
  return makeContext({
    actingMemberId: opts.actingMemberId,
    viaDelegationId: opts.viaDelegationId ?? null,
    db: SENTINEL_DB,
  })
}

// T167 (#193) — a context for a caller who has no account.
//
// F076 criterion 13 opens exactly one anonymous write path: leaving an email
// for a metro that is not open. That handler needs `now()` and a transaction
// and nothing else — it must never attribute anything to a member, because
// there isn't one.
//
// `actingMemberId` THROWS rather than carrying a sentinel. Widening
// `ActingMemberId` with an 'anonymous' member of the union was the obvious
// move and it is the wrong one: roughly twenty-five handlers guard with
// `!ctx.actingMemberId || ctx.actingMemberId === 'self-bootstrap'`, and a new
// sentinel passes every one of them — it is a non-empty string that is not
// 'self-bootstrap'. Each of those guards would go on reporting success about a
// question it was no longer asking, and the first symptom would be a row
// attributed to a member named "anonymous".
//
// Throwing inverts that. A handler reached with this context that reaches for
// an identity fails loudly, at the first read, in the test that gave it one.
// Same pattern, same reasoning, as SENTINEL_DB above.
export function resolveAnonymousActionContext(): ActionContext {
  return {
    get actingMemberId(): ActingMemberId {
      throw new Error(
        'ActionContext.actingMemberId: this is an anonymous context and has no acting member — ' +
          'a handler that needs one must not be reachable without an account',
      )
    },
    viaDelegationId: null,
    traceId: crypto.randomUUID(),
    db: SENTINEL_DB,
    now: () => new Date(),
  }
}
