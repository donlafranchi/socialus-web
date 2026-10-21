// #987 — what proves a claimant runs the business (2026-10-21, well-worn: Google Business Profile, Yelp):
// a code to an address at its own website domain, or to the phone listed on the Page. Neither → proof to moderation.
import { createHash, randomInt } from 'node:crypto'

export const CLAIM_LIMITS = {
  codeMinutes: 15,
  attempts: 5,
  startsPerMemberPerDay: 5,
  startsPerPagePerDay: 10,
} as const

// Hosts anyone can hold a page or address on: a profile there proves nothing about mail at the domain.
const SHARED_HOSTS = [
  'facebook.com', 'fb.com', 'instagram.com', 'tiktok.com', 'x.com', 'twitter.com', 'youtube.com', 'linkedin.com',
  'pinterest.com', 'etsy.com', 'yelp.com', 'google.com', 'goo.gl', 'linktr.ee', 'wixsite.com', 'square.site',
  'squarespace.com', 'godaddysites.com', 'business.site', 'weebly.com', 'wordpress.com', 'blogspot.com',
  'myshopify.com', 'carrd.co', 'gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'icloud.com',
]

const under = (host: string, base: string) => host === base || host.endsWith(`.${base}`)

export function ownDomain(url: string | null | undefined): string | null {
  if (!url) return null
  let host: string
  try {
    host = new URL(url).hostname.toLowerCase()
  } catch {
    return null
  }
  if (!host.includes('.') || SHARED_HOSTS.some((s) => under(host, s))) return null
  return host.replace(/^www\./, '')
}

export function emailAtDomain(email: string, domain: string): boolean {
  const m = email.trim().toLowerCase().match(/^[^@\s]+@([a-z0-9.-]+)$/)
  return Boolean(m && under(m[1]!, domain.toLowerCase()))
}

/** US numbers only, as listed: +1 and ten digits, or null. */
export function normalizePhone(phone: string | null | undefined): string | null {
  const d = (phone ?? '').replace(/\D/g, '')
  const ten = d.length === 11 && d.startsWith('1') ? d.slice(1) : d
  return ten.length === 10 ? `+1${ten}` : null
}

export const maskPhone = (e164: string) => `•••-•••-${e164.slice(-4)}`

export interface ClaimOptions {
  emailDomain: string | null
  phone: string | null
  /** Only when no code can reach the business: the one case a person decides. */
  proof: boolean
}

export function claimOptions(page: { publicInfoUrl: string | null; contactPhone: string | null; phoneEnabled: boolean }): ClaimOptions {
  const emailDomain = ownDomain(page.publicInfoUrl)
  const phone = page.phoneEnabled ? normalizePhone(page.contactPhone) : null
  return { emailDomain, phone, proof: !emailDomain && !phone }
}

/** Off until a texting provider is live (Twilio is parked); set CLAIM_BY_PHONE=on to offer it. */
export const phoneClaimsEnabled = (env: Record<string, string | undefined> = process.env) => env.CLAIM_BY_PHONE === 'on'

export const newCode = () => String(randomInt(0, 1_000_000)).padStart(6, '0')

export const hashCode = (claimId: string, code: string) => createHash('sha256').update(`${claimId}:${code}`).digest('hex')
