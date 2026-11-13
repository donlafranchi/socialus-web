import { describe, it, expect } from 'vitest'
import { filled, neighbours, pathFor, phoneE164, sideOf, SEGMENTS, STEPS, SCREENS, OPTIONAL, LANDING_HEADLINE } from './journey'

describe('waitlist journey (#1299)', () => {
  it('discover-only skips the being-found screens; any being-found chip adds them', () => {
    expect(pathFor(['find-events'])).toEqual(['local', 'plans', 'name', 'zip', 'email', 'phone', 'done'])
    expect(pathFor(['find-events', 'teach'])).toEqual([...STEPS])
  })

  it('counts a being-found chip on the makers’ side, otherwise supporters', () => {
    expect(sideOf(['find-groups'])).toBe('patron')
    expect(sideOf(['find-groups', 'organize'])).toBe('creator')
  })

  it('asks the mobile number last, after email, before the finish', () => {
    const p = pathFor(['have-business'])
    expect(p.slice(-4)).toEqual(['zip', 'email', 'phone', 'done'])
  })

  it('Back from the first screen goes to the landing; every screen has a way back', () => {
    expect(neighbours('local', []).back).toBe('/join/waitlist')
    for (const s of pathFor(['teach'])) expect(neighbours(s, ['teach']).back).toMatch(/^\/join\//)
    expect(neighbours('plans', ['find-events']).next).toBe('/join/name')
    expect(neighbours('plans', ['teach']).next).toBe('/join/be-found')
  })

  it('only the two detail screens are skippable', () => {
    expect(OPTIONAL).toEqual(['kind', 'called'])
  })

  it('the bar fills fast then slow, never backwards, with no step count', () => {
    for (const plans of [['find-events'], ['teach']]) {
      const path = pathFor(plans)
      const f = path.map((s) => filled(s, plans))
      for (let i = 1; i < f.length; i++) expect(f[i]).toBeGreaterThanOrEqual(f[i - 1])
      const steps = f.slice(1).map((v, i) => v - f[i])
      expect(steps[0]).toBeGreaterThan(steps[steps.length - 1])
      expect(f[f.length - 1]).toBe(SEGMENTS)
    }
  })

  it('takes a US mobile in any format, refuses what cannot be one', () => {
    expect(phoneE164('(916) 555-0142')).toBe('+19165550142')
    expect(phoneE164('1-916-555-0142')).toBe('+19165550142')
    expect(phoneE164('555-0142')).toBeNull()
    expect(phoneE164('016 555 0142')).toBeNull()
  })

  it('carries the why-phone line and the look-out-for-one-another line', () => {
    expect(SCREENS.phone.body).toContain('bots and spam')
    expect(SCREENS.phone.body).toContain('not internet numbers')
  })

  it('the headline is one swappable placeholder until the PM picks', () => {
    expect(LANDING_HEADLINE).toMatch(/^\[Headline/)
  })
})
