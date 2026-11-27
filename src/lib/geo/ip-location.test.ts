import { describe, it, expect } from 'vitest'
import { ipPointFrom } from './ip-location'

const h = (o: Record<string, string>) => ({ get: (k: string) => o[k] ?? null })

describe('ipPointFrom', () => {
  it('reads Vercel’s guess as [lng, lat]', () => {
    expect(ipPointFrom(h({ 'x-vercel-ip-latitude': '38.58', 'x-vercel-ip-longitude': '-121.49' }))).toEqual([-121.49, 38.58])
  })
  it('no header, half a header, or nonsense is no guess', () => {
    expect(ipPointFrom(h({}))).toBeNull()
    expect(ipPointFrom(h({ 'x-vercel-ip-latitude': '38.58' }))).toBeNull()
    expect(ipPointFrom(h({ 'x-vercel-ip-latitude': 'abc', 'x-vercel-ip-longitude': '-121' }))).toBeNull()
    expect(ipPointFrom(h({ 'x-vercel-ip-latitude': '95', 'x-vercel-ip-longitude': '-121' }))).toBeNull()
  })
})
