'use server'

// #353, #987 — stand-ins for the demo: nothing is written, every request "succeeds".

import type { UnclaimedResult } from '@/app/_actions/unclaimed-actions'
import type { ClaimChoices, ClaimResult } from '@/app/_actions/claim-actions'

export async function demoRemove(): Promise<UnclaimedResult> {
  return { ok: true }
}

export async function demoChoices(): Promise<ClaimChoices> {
  return { emailDomain: 'examplebakery.com', phone: null, proof: false }
}

export async function demoProofChoices(): Promise<ClaimChoices> {
  return { emailDomain: null, phone: null, proof: true }
}

export async function demoStart(input: { email?: string }): Promise<ClaimResult<{ claimId: string; sentTo: string }>> {
  return { ok: true, claimId: '00000000-0000-4000-8000-000000000000', sentTo: input.email ?? '•••-•••-0100' }
}

export async function demoVerify(): Promise<ClaimResult> {
  return { ok: true }
}

export async function demoProof(): Promise<ClaimResult> {
  return { ok: true }
}
