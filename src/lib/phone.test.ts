import { describe, it, expect } from 'vitest'
import { formatUsPhone, normalizeUsPhone } from './phone'

describe('US phone numbers', () => {
  it('accepts the ways people type one and returns E.164', () => {
    for (const raw of ['916-555-0142', '(916) 555 0142', '9165550142', '+1 916 555 0142', '1-916-555-0142']) {
      expect(normalizeUsPhone(raw)).toBe('+19165550142')
    }
  })
  it('refuses anything that is not ten US digits', () => {
    for (const raw of ['', '555-0142', '916555014', '+44 20 7946 0958', '0165550142', 'call me']) {
      expect(normalizeUsPhone(raw)).toBeNull()
    }
  })
  it('reads back the way people write it', () => {
    expect(formatUsPhone('+19165550142')).toBe('(916) 555-0142')
  })
})
