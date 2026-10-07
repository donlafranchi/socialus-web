// chore #432 — checks the live smoke makes of a screen's text, besides that it
// loaded without an error. Small on purpose: the database half of "who sees
// what" is the visibility matrix (tests/visibility.test.ts); this looks at what
// actually rendered on production.
const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)*\.[a-z]{2,}/gi
const ERROR_PAGE = /Application error|Internal Server Error|This page couldn.t load|Unhandled Runtime Error|Something went wrong/i

/** Addresses the product itself may show anyone (not a builder account's). */
const isPublic = (e: string) => /@socialus\.org$/i.test(e) && !/^builder\+/i.test(e)

/** What is wrong with this screen's text for this viewer; empty when fine. */
export function leaks(_persona: string, text: string, ownEmail: string | null): string[] {
  const found: string[] = []
  const seen = new Set<string>()
  for (const raw of text.match(EMAIL) ?? []) {
    const e = raw.toLowerCase()
    if (seen.has(e)) continue
    seen.add(e)
    if (ownEmail && e === ownEmail.toLowerCase()) continue
    if (isPublic(e)) continue
    found.push(`an email address that is not the viewer's own: ${raw}`)
  }
  const err = ERROR_PAGE.exec(text)
  if (err) found.push(`an error page: "${err[0]}"`)
  return found
}
