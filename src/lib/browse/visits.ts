// #796 — when this browser last opened SocialUs, so Explore can lead with what is new since then.
// One cookie, `<last>.<this>` in base-36 epoch ms; the proxy rolls it when a new visit (a new #557 seed) starts.

export const VISIT_COOKIE = 'su_visit'
export const VISIT_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

const parse = (value: string | undefined | null): { last: number | null; current: number | null } => {
  const m = /^([0-9a-z]*)\.([0-9a-z]+)$/.exec(value ?? '')
  if (!m) return { last: null, current: null }
  const at = (s: string) => (s ? parseInt(s, 36) : null)
  return { last: at(m[1]!), current: at(m[2]!) }
}

/** The cookie for a visit starting now: this visit becomes the last one. */
export function nextVisitCookie(current: string | undefined | null, now: Date): string {
  const { current: was } = parse(current)
  return `${was === null ? '' : was.toString(36)}.${now.getTime().toString(36)}`
}

/** The visit before this one, or null on a first visit. */
export function lastVisitFrom(value: string | undefined | null): Date | null {
  const { last } = parse(value)
  return last === null || !Number.isFinite(last) ? null : new Date(last)
}
