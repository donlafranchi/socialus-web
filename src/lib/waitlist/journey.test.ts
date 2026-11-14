import { describe, it, expect } from 'vitest'
import { filled, neighbours, pathFor, phoneE164, sideOf, SEGMENTS, STEPS, SCREENS, OPTIONAL, LANDING_HEADLINE, PHONE_WHY, LEGACY_STEPS, isStep } from './journey'
import nextConfig from '../../../next.config'

describe('waitlist journey (#1320: four screens)', () => {
  it('discover-only goes plans → contact; any being-found chip adds the business page', () => {
    expect(pathFor(['find-events'])).toEqual(['plans', 'contact', 'done'])
    expect(pathFor(['find-events', 'teach'])).toEqual([...STEPS])
    expect(STEPS).toEqual(['plans', 'business', 'contact', 'done'])
  })

  it('counts a being-found chip on the makers’ side, otherwise supporters', () => {
    expect(sideOf(['find-groups'])).toBe('patron')
    expect(sideOf(['find-groups', 'organize'])).toBe('creator')
  })

  it('asks the contact page last, with the mobile number last on it', () => {
    expect(pathFor(['have-business']).slice(-2)).toEqual(['contact', 'done'])
  })

  it('Back from the first screen goes to the landing; every screen has a way back', () => {
    expect(neighbours('plans', []).back).toBe('/join/waitlist')
    expect(neighbours('plans', ['find-events']).next).toBe('/join/contact')
    expect(neighbours('plans', ['teach']).next).toBe('/join/business')
    expect(neighbours('contact', ['find-events']).back).toBe('/join/plans')
    expect(neighbours('contact', ['teach']).back).toBe('/join/business')
  })

  it('only the business page is skippable', () => {
    expect(OPTIONAL).toEqual(['business'])
  })

  it('the bar is three segments, never backwards, full at the finish', () => {
    expect(SEGMENTS).toBe(3)
    for (const plans of [['find-events'], ['teach']]) {
      const f = pathFor(plans).map((s) => filled(s))
      for (let i = 1; i < f.length; i++) expect(f[i]).toBeGreaterThanOrEqual(f[i - 1])
      expect(f[0]).toBe(1)
      expect(f[f.length - 1]).toBe(SEGMENTS)
      expect(filled('contact')).toBe(3)
    }
  })

  it('takes a US mobile in any format, refuses what cannot be one', () => {
    expect(phoneE164('(916) 555-0142')).toBe('+19165550142')
    expect(phoneE164('1-916-555-0142')).toBe('+19165550142')
    expect(phoneE164('555-0142')).toBeNull()
    expect(phoneE164('016 555 0142')).toBeNull()
  })

  it('carries the why-phone line and the look-out-for-one-another line', () => {
    expect(PHONE_WHY).toContain('bots and spam')
    expect(PHONE_WHY).toContain('not internet numbers')
  })

  it('keeps one image slot on every screen, and the explainer is one line on the plans page', () => {
    for (const s of STEPS) expect(SCREENS[s].image.length).toBeGreaterThan(0)
    expect(SCREENS.plans.explainer).toBeTruthy()
    expect(isStep('local')).toBe(false)
  })

  it('the headline is the PM’s rewrite, in one constant', () => {
    expect(LANDING_HEADLINE).toBe('Made for us.')
  })

  it('every old screen address redirects to the page that now holds it', async () => {
    const rules = await nextConfig.redirects!()
    const to = (old: string) => rules.find((r) => r.source === `/join/${old}`)?.destination
    expect(Object.keys(LEGACY_STEPS).sort()).toEqual(['be-found', 'called', 'email', 'kind', 'local', 'name', 'phone', 'zip'])
    for (const [old, now] of Object.entries(LEGACY_STEPS)) expect(to(old)).toBe(`/join/${now}`)
    expect(to('local')).toBe('/join/plans')
    expect(to('phone')).toBe('/join/contact')
    expect(to('kind')).toBe('/join/business')
  })
})
