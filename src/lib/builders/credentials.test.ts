import { describe, it, expect } from 'vitest'
import { BUILDER_PERSONAS, builderEmail, builderPassword } from './credentials'

describe('#280 — builder credentials', () => {
  it('one builder per persona, signed out aside', () => {
    expect(BUILDER_PERSONAS).not.toContain('signedOut')
    expect(BUILDER_PERSONAS).toEqual(expect.arrayContaining(['stranger', 'operator', 'ownerBusiness', 'ownerFamily']))
  })

  it('derives a stable password per persona from the seed, never the seed itself', () => {
    const a = builderPassword('seed-one-for-the-test', 'stranger')
    expect(a).toBe(builderPassword('seed-one-for-the-test', 'stranger'))
    expect(a).not.toBe(builderPassword('seed-one-for-the-test', 'member'))
    expect(a).not.toBe(builderPassword('seed-two-for-the-test', 'stranger'))
    expect(a).not.toContain('seed-one-for-the-test')
    expect(a.length).toBeGreaterThanOrEqual(32)
  })

  it('refuses a missing or short seed', () => {
    expect(() => builderPassword('', 'stranger')).toThrow()
    expect(() => builderPassword('short', 'stranger')).toThrow()
  })

  it('addresses each builder from a template', () => {
    expect(builderEmail('ownerBusiness', 'builder+{persona}@socialus.org')).toBe('builder+ownerbusiness@socialus.org')
  })
})
