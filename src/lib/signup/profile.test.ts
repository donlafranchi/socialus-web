// #222 (F081) — signup collects exactly four fields, plus the 18+ box.

import { describe, it, expect } from 'vitest'
import { validateSignupProfile } from './profile'

const ok = { legalName: 'Maya Rivera', displayName: 'Maya', zip: '95819', adultConfirmed: true }

describe('validateSignupProfile', () => {
  it('accepts the four fields and the 18+ confirmation, trimmed', () => {
    expect(validateSignupProfile({ ...ok, legalName: '  Maya Rivera ', displayName: ' Maya ' })).toEqual({ ok: true, value: ok })
  })

  it('wants a legal name of at least two characters', () => {
    expect(validateSignupProfile({ ...ok, legalName: ' ' })).toMatchObject({ ok: false, field: 'legalName' })
    expect(validateSignupProfile({ ...ok, legalName: 'M' })).toMatchObject({ ok: false, field: 'legalName' })
    expect(validateSignupProfile({ ...ok, legalName: 'x'.repeat(121) })).toMatchObject({ ok: false, field: 'legalName' })
  })

  it('wants a display name of 1–60 characters', () => {
    expect(validateSignupProfile({ ...ok, displayName: '' })).toMatchObject({ ok: false, field: 'displayName' })
    expect(validateSignupProfile({ ...ok, displayName: 'x'.repeat(61) })).toMatchObject({ ok: false, field: 'displayName' })
  })

  it.each(['9581', '958190', 'abcde', '95819-1234', ''])('refuses the zip %j', (zip) => {
    expect(validateSignupProfile({ ...ok, zip })).toMatchObject({ ok: false, field: 'zip' })
  })

  it('refuses without the 18+ confirmation', () => {
    expect(validateSignupProfile({ ...ok, adultConfirmed: false })).toMatchObject({ ok: false, field: 'adultConfirmed' })
  })

  it('reports the first problem in the order the screen asks', () => {
    expect(validateSignupProfile({ legalName: '', displayName: '', zip: '', adultConfirmed: false })).toMatchObject({ field: 'legalName' })
  })
})
