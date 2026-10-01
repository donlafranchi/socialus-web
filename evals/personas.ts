// #269 — one persona per role, seeded into a LOCAL stack by
// supabase/seeds/personas.sql (scripts/seed-personas.sh refuses any other
// host). The password is a local test value and exists nowhere else.
//
// tests/personas-agree.test.ts fails if this file and the SQL drift.

export const PERSONA_PASSWORD = 'qa-persona-local-only'

export type PersonaKey =
  | 'signedOut'
  | 'stranger'
  | 'follower'
  | 'member'
  | 'applicant'
  | 'rsvp'
  | 'operator'
  | 'ownerBusiness'
  | 'ownerPlace'
  | 'ownerInterest'
  | 'ownerPractice'
  | 'ownerEvent'
  | 'ownerFamily'

export interface Persona {
  key: PersonaKey
  /** What they are to the seeded Pages. */
  role: string
  id: string | null
  email: string | null
  handle: string | null
  /** The Page this persona runs, if any. */
  owns: PageKey | null
}

export type PageKey = 'business' | 'place' | 'interest' | 'practice' | 'event' | 'family'

export interface SeededPage {
  key: PageKey
  kind: string
  slug: string
  publicId: string
  name: string
  /** Private Pages have members, not followers (2026-09-15). */
  private: boolean
  locationSlug: string
}

const id = (n: string) => `0a000000-0000-4000-8000-0000000000${n}`
const p = (key: PersonaKey, n: string, role: string, owns: PageKey | null = null): Persona => ({
  key,
  role,
  id: id(n),
  email: `qa-${key.toLowerCase()}@example.test`,
  handle: `qa-${key.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())}`,
  owns,
})

export const PERSONAS: Persona[] = [
  { key: 'signedOut', role: 'signed out', id: null, email: null, handle: null, owns: null },
  p('stranger', '01', 'signed in, no relation to any Page'),
  p('follower', '02', 'follows every Page that can be followed'),
  p('member', '03', 'member of every Page, join confirmed by its runner'),
  p('applicant', '04', 'member of every Page, join not confirmed (approval is not built)'),
  p('rsvp', '05', "party to each Page's gathering, nothing else"),
  p('operator', '06', 'the operator (OPERATOR_MEMBER_ID)'),
  p('ownerBusiness', '11', 'owns the business Page', 'business'),
  p('ownerPlace', '12', 'stewards the place Page', 'place'),
  p('ownerInterest', '13', 'stewards the interest Page', 'interest'),
  p('ownerPractice', '14', 'stewards the practice Page', 'practice'),
  p('ownerEvent', '15', 'stewards the event Page', 'event'),
  p('ownerFamily', '16', 'stewards the private family Page', 'family'),
]

export const PAGES: SeededPage[] = [
  { key: 'business', kind: 'business', slug: 'qa-corner-bakery', publicId: 'qa0b01', name: 'QA Corner Bakery', private: false, locationSlug: 'qa-corner-bakery-shop' },
  { key: 'place', kind: 'place', slug: 'qa-oak-park-commons', publicId: 'qa0p01', name: 'QA Oak Park Commons', private: false, locationSlug: 'qa-oak-park-commons-green' },
  { key: 'interest', kind: 'interest', slug: 'qa-river-run-club', publicId: 'qa0n01', name: 'QA River Run Club', private: false, locationSlug: 'qa-river-run-club-start' },
  { key: 'practice', kind: 'practice', slug: 'qa-pottery-studio', publicId: 'qa0r01', name: 'QA Pottery Studio', private: false, locationSlug: 'qa-pottery-studio-room' },
  { key: 'event', kind: 'event_anchored', slug: 'qa-street-fair', publicId: 'qa0e01', name: 'QA Street Fair', private: false, locationSlug: 'qa-street-fair-block' },
  { key: 'family', kind: 'family', slug: 'qa-family', publicId: 'qa0f01', name: 'QA Family', private: true, locationSlug: 'qa-family-home' },
]

export const pageHandle = (page: SeededPage) => `${page.slug}-${page.publicId}`
export const persona = (key: PersonaKey) => PERSONAS.find((x) => x.key === key)!
export const page = (key: PageKey) => PAGES.find((x) => x.key === key)!
