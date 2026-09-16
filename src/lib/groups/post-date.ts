// F072 — one date format for a post, used by the server render and by the
// client after a post is written.
//
// Fixed locale and fixed time zone. A post says when it was written, and a
// server and a browser in different zones must agree on that string or React
// reports a hydration mismatch on a Page that has posts.

export function formatPostDate(iso: string, now: Date = new Date()): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const sameYear = d.getUTCFullYear() === now.getUTCFullYear()
  return d.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
    timeZone: 'UTC',
  })
}
