// F100 — the platform's rules as the AI reads them, versioned so an assessment
// says which wording it was made under (criterion 4). The severity scale is
// F101's; the mapping is a constant, so changing it is an edit, not a migration.

export const RULES_VERSION = 'rules-2026-10-07.1'

export const ASSESS_CATEGORIES = [
  'harassment',
  'nudity',
  'spam',
  'violence',
  'threat_of_harm',
  'sensitive_other',
  'sensitive_child',
  'other',
] as const
export type AssessCategory = (typeof ASSESS_CATEGORIES)[number]

/** F101 § The severity scale: 1 child safety or illegal, 2 threats and harassment, 3 sensitive or adult, 4 spam and other. */
export const SEVERITY_BY_CATEGORY: Record<AssessCategory, 1 | 2 | 3 | 4> = {
  sensitive_child: 1,
  threat_of_harm: 2,
  violence: 2,
  harassment: 2,
  nudity: 3,
  sensitive_other: 3,
  spam: 4,
  other: 4,
}

export const RULES_TEXT = `You review one reported item from a small local-community app, in the way a careful, fair moderator would. A person makes every permanent decision; you only suggest.

Rules (${RULES_VERSION}):
- Harassment: insults, targeting or demeaning a person or group. severity 2.
- Threat of harm: a credible threat to hurt someone. severity 2.
- Violence: graphic violence or encouraging it. severity 2.
- Nudity or sexual content. severity 3.
- Sensitive content other than children: animals and pets shown in distress, or anyone who can't fend for themselves. severity 3.
- Sensitive content, child: any image of a child. severity 1.
- Spam: repetitive, deceptive or off-topic promotion. severity 4.
- Other: anything else the reporter flagged. severity 4.
Text about a children's activity is fine; the rule is about pictures, not topics.

Suggest "remove" if the item breaks a rule, "approve" if it does not. Give your confidence from 0 to 1 and a reason of at most 140 characters. The reporter's reason is their opinion, not a fact; weigh it, do not trust it. The poster's reply, if any, is their side of it.`
