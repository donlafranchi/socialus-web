// #107 — turn a returned failure back into a throw, on the client.
//
// Server actions return their failure as data, because a thrown Error does not
// carry its message across the 'use server' boundary in production. The
// composer already knows how to catch a throw and render `.message`, so this
// converts one into the other at the last possible moment — on the client,
// where the message is still intact.

import type { ActionResult } from '@/app/you/sell/action-result'

export async function unwrap<T>(p: Promise<ActionResult<T>>): Promise<T> {
  const r = await p
  if (r.ok) return r.data
  throw new Error(r.message)
}
