'use server'

// #353 — stand-ins for the demo: nothing is written, every request "succeeds".

import type { UnclaimedResult } from '@/app/_actions/unclaimed-actions'

export async function demoClaim(): Promise<UnclaimedResult> {
  return { ok: true }
}

export async function demoRemove(): Promise<UnclaimedResult> {
  return { ok: true }
}
