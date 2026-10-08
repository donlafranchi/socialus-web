import { describe, it, expect } from 'vitest'
import { ipFrom } from './request-ip'

// F102 criterion 13 — the address a post or upload came from, for tracing abuse.
const h = (o: Record<string, string>) => ({ get: (k: string) => o[k.toLowerCase()] ?? null })

describe('ipFrom', () => {
  it('takes the first hop of x-forwarded-for, the client Vercel saw', () => {
    expect(ipFrom(h({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' }))).toBe('203.0.113.7')
  })
  it('falls back to x-real-ip', () => {
    expect(ipFrom(h({ 'x-real-ip': '198.51.100.9' }))).toBe('198.51.100.9')
  })
  it('reads an IPv6 address', () => {
    expect(ipFrom(h({ 'x-forwarded-for': '2001:db8::1' }))).toBe('2001:db8::1')
  })
  it('is null when there is no address', () => {
    expect(ipFrom(h({}))).toBeNull()
  })
  it('refuses anything that is not an address, so a header cannot write free text', () => {
    expect(ipFrom(h({ 'x-forwarded-for': "'; drop table members; --" }))).toBeNull()
    expect(ipFrom(h({ 'x-forwarded-for': 'a'.repeat(200) }))).toBeNull()
  })
})
