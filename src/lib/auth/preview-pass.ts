// #400 — the operator preview pass (Don, 2026-10-05). A secret link that signs
// one named account in on a PREVIEW deployment, so Don stops getting a magic
// link by email on every preview domain. Pure checks only; the sign-in itself
// is in src/actions/_lib/preview-pass-link.ts, the one place the secret key may live.
//
// What it can do: sign in PREVIEW_PASS_EMAIL on a preview built with the token.
// What it can't: run on production (VERCEL_ENV must be 'preview'), sign in
// anyone else, outlive 30 days, or survive the token being rotated (on
// deployments built after the rotation — Vercel env changes only reach new builds).

import { createHash, timingSafeEqual } from 'node:crypto'

type Env = Record<string, string | undefined>

export const PASS_COOKIE = 'su_preview_pass'
export const PASS_DAYS = 30
const MIN_TOKEN_LENGTH = 24

const sha256 = (s: string) => createHash('sha256').update(s).digest()

/** The pass exists only on a preview that has a long enough token and an account to sign in. */
export function passEnabled(env: Env): boolean {
  return (
    env.VERCEL_ENV === 'preview' &&
    (env.PREVIEW_PASS_TOKEN?.length ?? 0) >= MIN_TOKEN_LENGTH &&
    Boolean(env.PREVIEW_PASS_EMAIL?.trim())
  )
}

/** Constant-time: hashing first makes the lengths equal, so length leaks nothing either. */
export function tokenMatches(given: string | null, env: Env): boolean {
  if (!given || !passEnabled(env)) return false
  return timingSafeEqual(sha256(given), sha256(env.PREVIEW_PASS_TOKEN!))
}

/** Which token a session came from, without storing the token: rotating it changes this. */
export function fingerprint(env: Env): string {
  return sha256(`preview-pass:${env.PREVIEW_PASS_TOKEN ?? ''}`).toString('hex').slice(0, 32)
}

export function passCookieValue(env: Env, now: Date): string {
  return `${fingerprint(env)}.${now.getTime()}`
}

/**
 * A session the pass made is still good while the token it came from is the
 * current one and it is under 30 days old. A missing cookie means the session
 * did not come from the pass, and is none of this file's business.
 */
export function passCookieStillGood(value: string, env: Env, now: Date): boolean {
  const [fp, issued] = value.split('.')
  const age = now.getTime() - Number(issued)
  return passEnabled(env) && fp === fingerprint(env) && Number.isFinite(age) && age >= 0 && age < PASS_DAYS * 864e5
}
