// Single guard for every post-auth `?next=` redirect target (T111 review, #1).
//
// `next.startsWith('/')` is NOT sufficient: `//evil.com` and `/\evil.com` both
// pass it, and `new URL()` resolves both to an external origin — an open
// redirect on the auth callback, which is the worst place to have one. Only a
// single leading slash followed by a non-slash, non-backslash character is a
// same-origin path.
const SAFE_PATH = /^\/(?![/\\])/
// `new URL()` strips tabs and newlines, so `/\t/evil.com` resolves off-site:
// no control character or whitespace anywhere (#400 security review).
const UNSAFE_CHAR = /[\u0000-\u0020\u007f]/

export function safeNext(next: string | null | undefined, fallback = '/'): string {
  return next && SAFE_PATH.test(next) && !UNSAFE_CHAR.test(next) ? next : fallback
}
