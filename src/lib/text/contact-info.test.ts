import { describe, it, expect } from 'vitest'
import { containsEmail, maskEmails, EMAIL_MASK } from './contact-info'

// #450 — a Page's text showed a person's email address to signed-out visitors.

describe('containsEmail', () => {
  it.each([
    ['plain', 'owned by someone@example.com'],
    ['mixed case', 'Write To Owner@Example.COM today'],
    ['plus-addressing', 'floats+summer@example.com'],
    ['subdomain', 'a.person@mail.example.co.uk'],
    ['glued to punctuation', 'Questions? (owner@example.com).'],
    ['glued to a comma', 'owner@example.com,thanks'],
  ])('flags %s', (_label, text) => {
    expect(containsEmail(text)).toBe(true)
  })

  it.each([
    ['a handle', 'Follow @sacriverfloaters'],
    ['spaced at', 'meet user @ place downtown'],
    ['a URL', 'See https://example.com/floats?x=1'],
    ['no dot TLD', 'a@b'],
    ['empty', ''],
  ])('does not flag %s', (_label, text) => {
    expect(containsEmail(text)).toBe(false)
  })

  it('is stable across calls (no global-regex lastIndex carry-over)', () => {
    expect(containsEmail('x@example.com')).toBe(true)
    expect(containsEmail('x@example.com')).toBe(true)
  })
})

describe('maskEmails', () => {
  it('replaces each address with the mask and keeps the rest', () => {
    expect(maskEmails('owned by one@example.com and Two@Example.org.')).toBe(
      `owned by ${EMAIL_MASK} and ${EMAIL_MASK}.`,
    )
  })

  it('leaves text without an address untouched', () => {
    const text = 'Follow @sacriverfloaters at https://example.com — a@b'
    expect(maskEmails(text)).toBe(text)
  })
})
