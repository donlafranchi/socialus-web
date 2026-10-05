// Client-safe: reports-queue.ts holds the database pool and must not reach a browser bundle.

/** "3 days" / "4 hours" / "12 minutes" — how long content has been withheld. */
export function hiddenFor(since: Date | null, now: Date): string | null {
  if (!since) return null
  const mins = Math.max(0, Math.floor((now.getTime() - since.getTime()) / 60000))
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'}`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'}`
  const days = Math.floor(hours / 24)
  return `${days} day${days === 1 ? '' : 's'}`
}
