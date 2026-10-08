// F102 criterion 13 — the address a post or an upload came from. Operator-only,
// kept a year, used by no feature outside the report path. Read in the server
// action (the action layer never touches headers) and passed in.

import { headers } from 'next/headers'

type H = { get(name: string): string | null }

// Hex, digits, dots and colons only: an address, never free text.
const ADDRESS = /^[0-9a-fA-F:.]{2,45}$/

export function ipFrom(h: H): string | null {
  const raw = h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip')?.trim() || ''
  return ADDRESS.test(raw) ? raw : null
}

/** The current request's address, or null outside a request. */
export async function requestIp(): Promise<string | null> {
  try {
    return ipFrom(await headers())
  } catch {
    return null
  }
}
