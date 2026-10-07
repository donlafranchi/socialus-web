// #329 — the last metro picked on this device. Read on the server so the pill
// and the first paint agree; a signed-in member's own setting beats it.
export const METRO_COOKIE = 'su_metro'
export const METRO_COOKIE_MAX_AGE = 60 * 60 * 24 * 365
