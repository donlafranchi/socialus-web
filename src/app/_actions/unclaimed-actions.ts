'use server'

// #353 — Claim and Remove on an unclaimed Page, signed in or out. The device
// is a random id in a cookie, hashed before it leaves this file; it only counts
// requests per day (DAILY_LIMIT_PER_DEVICE). No address is stored.

import { createHash, randomUUID } from 'node:crypto'
import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { resolveAnonymousActionContext } from '@/lib/action-context'
import { groupUnclaimedClaim, groupUnclaimedRemove, type UnclaimedRemovalScope } from '@/actions/group'
import { ActionError, ConflictError } from '@/actions/_lib/errors'

const DEVICE_COOKIE = 'su_device'

async function deviceHash(): Promise<string> {
  const jar = await cookies()
  let id = jar.get(DEVICE_COOKIE)?.value
  if (!id || !/^[0-9a-f-]{36}$/.test(id)) {
    id = randomUUID()
    jar.set(DEVICE_COOKIE, id, { httpOnly: true, sameSite: 'lax', secure: true, path: '/', maxAge: 60 * 60 * 24 * 365 })
  }
  return createHash('sha256').update(id).digest('hex')
}

export type UnclaimedResult = { ok: true } | { ok: false; reason: 'limit' | 'failed' }

async function run(fn: () => Promise<unknown>): Promise<UnclaimedResult> {
  try {
    await fn()
    return { ok: true }
  } catch (err) {
    if (err instanceof ConflictError) return { ok: false, reason: 'limit' }
    if (err instanceof ActionError) return { ok: false, reason: 'failed' }
    throw err
  }
}

export async function requestUnclaimedClaimAction(input: {
  groupId: string
  name: string
  contact: string
  message?: string
}): Promise<UnclaimedResult> {
  const device = await deviceHash()
  return run(() => groupUnclaimedClaim(resolveAnonymousActionContext(), { ...input, deviceHash: device }))
}

export async function requestUnclaimedRemovalAction(input: {
  groupId: string
  scope: UnclaimedRemovalScope
  contact: string
  reason?: string
  confirmed: boolean
  pagePath: string
}): Promise<UnclaimedResult> {
  const device = await deviceHash()
  const result = await run(() =>
    groupUnclaimedRemove(resolveAnonymousActionContext(), {
      groupId: input.groupId,
      scope: input.scope,
      contact: input.contact,
      reason: input.reason,
      confirmed: input.confirmed,
      deviceHash: device,
    }),
  )
  if (result.ok) revalidatePath(input.pagePath)
  return result
}
