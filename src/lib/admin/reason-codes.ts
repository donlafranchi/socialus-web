// The preset reasons. Codes are in the schema CHECK; the words are here.
//
// Why the split: a code is an internal identifier and should be stable — it is
// what makes decisions countable, so we can see which reasons dominate. The
// WORDING is Don's under the public-is-draft rule and will change. If the words
// lived in the CHECK, every rephrasing would be a migration and a production
// apply, and the wording would stop changing for the wrong reason.
//
// EVERY REASON IS WRITTEN TO BE READ BY THE MEMBER whose content it was. Not
// internal shorthand — a reason nobody can be told is a reason that cannot be
// appealed. Whether the member IS told is unsettled: F058 criterion 2 says a
// *report* changes nothing visible to the reported party and is silent on the
// *outcome*. Flagged for Don. These are written so that the answer can be yes.
//
// DRAFT COPY. Don has not signed off the wording.

export const REASON_CODES = [
  'nothing_wrong',
  'reported_by_mistake',
  'not_a_real_place',
  'someone_elses_photo',
  'not_suitable',
  'person_did_not_agree',
  'other',
] as const

export type ReasonCode = (typeof REASON_CODES)[number]
export type Outcome = 'restored' | 'removed'

export interface ReasonOption {
  code: ReasonCode
  /** What the operator taps. */
  label: string
  /** What the member would be told, in plain words. */
  memberText: string
  /** Which button this sits under. `both` appears on each. */
  appliesTo: Outcome | 'both'
}

export const REASONS: readonly ReasonOption[] = [
  {
    code: 'nothing_wrong',
    label: 'Nothing wrong with it',
    memberText: 'We looked, and there’s nothing wrong with your photo. It’s back up.',
    appliesTo: 'restored',
  },
  {
    code: 'reported_by_mistake',
    label: 'Reported by mistake',
    memberText: 'Your photo was reported by mistake. It’s back up.',
    appliesTo: 'restored',
  },
  {
    code: 'not_a_real_place',
    label: 'Not a real place or business',
    memberText: 'We took your photo down — it isn’t about a real place or business.',
    appliesTo: 'removed',
  },
  {
    code: 'someone_elses_photo',
    label: 'Someone else’s photo',
    memberText: 'We took your photo down — it looks like someone else’s work.',
    appliesTo: 'removed',
  },
  {
    code: 'not_suitable',
    label: 'Not suitable here',
    memberText: 'We took your photo down — it isn’t suitable for a neighbourhood app.',
    appliesTo: 'removed',
  },
  {
    code: 'person_did_not_agree',
    label: 'Shows someone who didn’t agree',
    memberText: 'We took your photo down — it shows someone who didn’t agree to be in it.',
    appliesTo: 'removed',
  },
  {
    code: 'other',
    label: 'Something else…',
    memberText: '',
    appliesTo: 'both',
  },
] as const

export function reasonsFor(outcome: Outcome): ReasonOption[] {
  return REASONS.filter((r) => r.appliesTo === outcome || r.appliesTo === 'both')
}

export function reasonLabel(code: ReasonCode): string {
  return REASONS.find((r) => r.code === code)?.label ?? code
}

/** 'other' is the one code whose whole purpose is the note. Matches the CHECK. */
export function reasonNeedsNote(code: ReasonCode): boolean {
  return code === 'other'
}
