// F081 ruling 2026-11-25 (the PM): a visitor's area is "guessed from their IP and confirmed, or asked as a zip …
// The zip is stored, with an easy opt-out." A visitor has no account, so it is stored on their device only (a
// cookie, as Zillow and Home Depot keep "your zip"), shown back to them alone, and one tap forgets it.
// A member's zip is theirs on /you (F081 criterion 4); this is never read for a member.

export const ZIP_COOKIE = 'su_zip'
export const ZIP_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

/** Five digits, nothing else: the only zip this stores or looks up. */
export const isZip = (z: unknown): z is string => typeof z === 'string' && /^\d{5}$/.test(z)
