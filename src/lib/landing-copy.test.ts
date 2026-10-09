// /landing copy — the voice rules a check can hold (voice-and-tone.md § 1),
// plus the preview's own hard rules (Don, 2026-10-08).

import { describe, it, expect } from 'vitest'
import { ABOUT, LANDING } from './landing-copy'

const strings = (v: unknown, out: string[] = []): string[] => {
  if (typeof v === 'string') out.push(v)
  else if (Array.isArray(v)) v.forEach((x) => strings(x, out))
  else if (v && typeof v === 'object') Object.values(v).forEach((x) => strings(x, out))
  return out
}
const landing = strings(LANDING)
const about = strings(ABOUT)
const all = [...landing, ...about]

describe('landing copy', () => {
  it('has no em dashes', () => {
    for (const s of all) expect(s).not.toMatch(/—/)
  })
  it('names no person as a category, and says people, not neighbors', () => {
    const banned = /\b(creators?|vendors?|sellers?|makers?|supporters?|patrons?|consumers?|producers?|neighbou?rs?)\b/i
    for (const s of all) expect(s).not.toMatch(banned)
  })
  it('uses no corporate transitions or hustle words', () => {
    const banned = /\b(moreover|furthermore|additionally|essentially|grow|scale|level up|crush it|grind|productivity|corner)\b|in a world where/i
    for (const s of all) expect(s).not.toMatch(banned)
  })
  it('says nothing about free, fees, returns or payouts, and names no city', () => {
    const banned = /\b(free|fees?|dividends?|shares?|payouts?|returns?|Sacramento)\b/i
    for (const s of all) expect(s).not.toMatch(banned)
  })
  it('says "never" exactly once on the About page, on "never extractive"', () => {
    const nevers = about.flatMap((s) => s.match(/\bnever\b/gi) ?? [])
    expect(nevers).toHaveLength(1)
    expect(about.some((s) => /never extractive/.test(s))).toBe(true)
  })
  it('every rotating item completes the sentence', () => {
    for (const item of LANDING.rotating.items) {
      expect(item).toMatch(/^[a-z]/)
      expect(item).not.toMatch(/[.!?]$/)
      expect(`${LANDING.rotating.prefix} ${item}.`).toMatch(/^Find people who love .+\.$/)
    }
    expect(LANDING.rotating.items).not.toContain('pickup games')
  })
})
