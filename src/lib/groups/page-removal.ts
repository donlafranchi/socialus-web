// #423 — a deleted Page is restorable for this many days, then removed.
export const DELETE_GRACE_DAYS = 14

/** "October 20", in the metro's time zone. */
export function formatRemovalDate(d: Date | string): string {
  return new Date(d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'America/Los_Angeles' })
}

export function removalDateFrom(now: Date): Date {
  return new Date(now.getTime() + DELETE_GRACE_DAYS * 24 * 60 * 60 * 1000)
}
