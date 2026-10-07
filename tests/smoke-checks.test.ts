// chore #432 — what a live smoke screen is checked for besides loading:
// an error page, and an email address that is not the viewer's own.

import { describe, it, expect } from 'vitest'
import { leaks } from '../evals/smoke/checks'

describe('leaks', () => {
  it('flags a builder email shown to someone else', () => {
    expect(leaks('stranger', 'Page by builder+member@socialus.org', 'builder+stranger@socialus.org')).toEqual([
      'an email address that is not the viewer\'s own: builder+member@socialus.org',
    ])
  })
  it('lets a viewer see their own email, in any case', () => {
    expect(leaks('member', 'Signed in as Builder+Member@socialus.org', 'builder+member@socialus.org')).toEqual([])
  })
  it('flags any email shown to a signed-out visitor', () => {
    expect(leaks('signedOut', 'write to someone@example.com', null)).toEqual(['an email address that is not the viewer\'s own: someone@example.com'])
  })
  it('allows the product\'s own public addresses', () => {
    expect(leaks('signedOut', 'Questions? hello@socialus.org', null)).toEqual([])
  })
  it('flags an error page', () => {
    expect(leaks('member', 'Application error: a server-side exception has occurred', 'x@y.org')).toEqual(['an error page: "Application error"'])
  })
  it("flags the app's own error screen", () => {
    expect(leaks('member', "Something went wrong\n\nIt's on our side. Try again in a moment.\nTry again", 'x@y.org')).toEqual(['an error page: "Something went wrong"'])
  })
  it('is empty for ordinary text', () => {
    expect(leaks('member', 'QA Corner Bakery\nFollow\nAnnouncements', 'a@b.co')).toEqual([])
  })
})
