// F082 — the rules a member agrees to before publishing a Page. Agreeing is the
// attestation (criterion 2): fixed statements, each with its reason, nothing
// typed. Versioned (criterion 6): change the text, bump RULES_VERSION, and every
// owner agrees again before their next publish.
//
// WORDING IS DRAFT for the PM's copy review ([public-is-draft]). Nothing here
// asks anyone to call themselves a business or uses legal or tax language
// (criterion 5). Rule 4's line is F082 criterion 9's, verbatim.

export const RULES_VERSION = 1

export interface CreatorRule {
  rule: string
  reason: string
}

export const CREATOR_RULES: readonly CreatorRule[] = [
  {
    rule: 'Be local.',
    reason: 'People come to SocialUs to find their neighbors, so say where you really are.',
  },
  {
    rule: 'It’s yours.',
    reason: 'What you publish is something you make, run or host. If someone else does, say so.',
  },
  {
    rule: 'Say it plainly.',
    reason: 'Describe what you offer as it is, so people know what they’re showing up for.',
  },
  {
    rule: 'No pictures of children.',
    reason: 'Please don’t post a photo that shows a child. We can’t check every photo, so we count on you.',
  },
]
