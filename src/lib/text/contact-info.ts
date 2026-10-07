// #450 — email addresses in Page text: refused on save, masked on display.

/** What a visitor sees in place of an address. Copy; change freely. */
export const EMAIL_MASK = '[email hidden]'

/** Owner-facing refusal when Page text carries an address. Draft copy, pending the PM's tone look. */
export const EMAIL_IN_PAGE_TEXT_MESSAGE = 'Take out the email address. People can reach you through your Page.'

// local@domain.tld: a local part, an @ with no spaces, at least one dot, and a letters-only TLD of 2+.
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g

export function containsEmail(text: string): boolean {
  EMAIL.lastIndex = 0
  return EMAIL.test(text)
}

export function maskEmails(text: string): string {
  return text.replace(EMAIL, EMAIL_MASK)
}

/** Null-safe maskEmails for optional fields in view models. */
export function maskEmailsOrNull<T extends string | null | undefined>(text: T): T {
  return (typeof text === 'string' ? maskEmails(text) : text) as T
}

/** True when any of the given texts (nulls skipped) carries an address. */
export function anyContainsEmail(...texts: Array<string | null | undefined>): boolean {
  return texts.some((t) => typeof t === 'string' && containsEmail(t))
}
