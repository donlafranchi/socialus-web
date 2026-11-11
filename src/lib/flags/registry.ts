// #1227 Feature flags of our own (PM, 2026-11-10; socialus-plan scenario-F128).
//
// Every flag is declared here, in code, and is temporary: it names the work it
// hides and the date it comes out. Who it is on for lives in the database
// (public.feature_flags), so it can be switched without a deploy; a flag with
// no row there is on for builder accounts and the operator only.
//
// Use it from server code only: `if (await flagOn('new-thing')) ...`. A client
// component gets the answer as a prop. `npm run flags:check` lists every flag,
// where the code reads it, and any past its removal date; a test fails on a
// flag read in code but not declared here, or declared here but read nowhere.
//
// To retire a flag: delete the reads, delete its entry here, and leave the row
// (a row for an undeclared key does nothing).

export type FlagDeclaration = {
  /** What the flag hides, in a few plain words. */
  readonly hides: string
  /** The Issue the hidden work belongs to. */
  readonly issue: number
  /** YYYY-MM-DD: by when the flag is removed from the code. */
  readonly removeBy: string
}

export const FLAGS = {
  // 'new-thing': { hides: 'the new thing', issue: 1234, removeBy: '2026-12-15' },
} as const satisfies Record<string, FlagDeclaration>

export type FlagKey = keyof typeof FLAGS

export const AUDIENCES = ['off', 'builders', 'everyone'] as const
export type Audience = (typeof AUDIENCES)[number]
