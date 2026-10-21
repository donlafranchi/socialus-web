import { describe, it, expect } from 'vitest'
import { ownDomain, emailAtDomain, claimOptions, hashCode, newCode, maskPhone, CLAIM_LIMITS } from './verify'

describe('#987 claim verification rules', () => {
  it("takes the business's own domain from its website", () => {
    expect(ownDomain('https://www.rosasbakery.com/about')).toBe('rosasbakery.com')
    expect(ownDomain('https://shop.rosasbakery.co.uk')).toBe('shop.rosasbakery.co.uk')
  })

  it('a social profile, marketplace or free site builder is not an own domain', () => {
    for (const u of [
      'https://www.facebook.com/rosas',
      'https://instagram.com/rosas',
      'https://www.etsy.com/shop/rosas',
      'https://rosas.wixsite.com/home',
      'https://rosas.square.site',
      'https://sites.google.com/view/rosas',
      'https://linktr.ee/rosas',
      'https://rosas.business.site',
    ]) expect(ownDomain(u), u).toBeNull()
    expect(ownDomain(null)).toBeNull()
    expect(ownDomain('not a url')).toBeNull()
  })

  it('an email counts only at the domain itself or a subdomain of it', () => {
    expect(emailAtDomain('Rosa@RosasBakery.com', 'rosasbakery.com')).toBe(true)
    expect(emailAtDomain('rosa@mail.rosasbakery.com', 'rosasbakery.com')).toBe(true)
    expect(emailAtDomain('rosa@evilrosasbakery.com', 'rosasbakery.com')).toBe(false)
    expect(emailAtDomain('rosa@rosasbakery.com.evil.io', 'rosasbakery.com')).toBe(false)
    expect(emailAtDomain('rosa@gmail.com', 'rosasbakery.com')).toBe(false)
    expect(emailAtDomain('a@b@rosasbakery.com', 'rosasbakery.com')).toBe(false)
  })

  it('offers proof only when neither a domain nor a working phone path exists', () => {
    expect(claimOptions({ publicInfoUrl: 'https://rosas.com', contactPhone: '916-555-0100', phoneEnabled: false })).toEqual({
      emailDomain: 'rosas.com', phone: null, proof: false,
    })
    expect(claimOptions({ publicInfoUrl: 'https://facebook.com/r', contactPhone: '(916) 555-0100', phoneEnabled: true })).toEqual({
      emailDomain: null, phone: '+19165550100', proof: false,
    })
    expect(claimOptions({ publicInfoUrl: null, contactPhone: '916-555-0100', phoneEnabled: false }).proof).toBe(true)
    expect(claimOptions({ publicInfoUrl: null, contactPhone: null, phoneEnabled: true }).proof).toBe(true)
  })

  it('codes are six digits and only their salted hash is kept', () => {
    const code = newCode()
    expect(code).toMatch(/^\d{6}$/)
    const h = hashCode('claim-1', code)
    expect(h).toMatch(/^[0-9a-f]{64}$/)
    expect(hashCode('claim-2', code)).not.toBe(h)
    expect(hashCode('claim-1', code)).toBe(h)
  })

  it('shows a phone with only its last digits', () => {
    expect(maskPhone('+19165550100')).toBe('•••-•••-0100')
  })

  it('limits are bounded', () => {
    expect(CLAIM_LIMITS.codeMinutes).toBeLessThanOrEqual(30)
    expect(CLAIM_LIMITS.attempts).toBeLessThanOrEqual(5)
    expect(CLAIM_LIMITS.startsPerMemberPerDay).toBeLessThanOrEqual(5)
  })
})
