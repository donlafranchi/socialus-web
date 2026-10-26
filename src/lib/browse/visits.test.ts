import { describe, it, expect } from 'vitest'
import { lastVisitFrom, nextVisitCookie } from './visits'

describe('#796 — the last visit', () => {
  it('a new visit moves this visit to "last" and starts a new one', () => {
    const first = nextVisitCookie(undefined, new Date('2026-10-13T01:00:00Z'))
    expect(lastVisitFrom(first)).toBeNull()
    const second = nextVisitCookie(first, new Date('2026-10-15T01:00:00Z'))
    expect(lastVisitFrom(second)?.toISOString()).toBe('2026-10-13T01:00:00.000Z')
  })
  it('a broken cookie is a first visit', () => {
    expect(lastVisitFrom('nonsense')).toBeNull()
    expect(lastVisitFrom(nextVisitCookie('nonsense', new Date('2026-10-15T01:00:00Z')))).toBeNull()
  })
})
