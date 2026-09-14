### bug #67 — The outgoing PKCE code challenge is now asserted

Don could not sign in on a preview: Supabase rejected the request with *"code challenge can only contain alphanumeric characters, hyphens, periods, underscores and tildes."* **The cause is not in this repo** — a repo-wide grep finds no code that builds a challenge, `auth-js` 2.103.0 emits correct base64url, and the real wire payload from the shipped stack is 43 characters of base64url with `s256`. The lockfile is in sync, so Vercel and local install the same tree. Diagnosis is waiting on the failing request from Don's browser; **nothing here is a fix for that bug.**

**What this ships is the gap the bug exposed.** Sign-in is magic-link only and the whole flow is PKCE, and **nothing in the suite covered any of it** — `useAuth.ts`, `MagicLinkForm.tsx`, `auth/callback/route.ts`, `src/lib/supabase.ts` and `proxy.ts` have no tests at all, and `EmailFirstSignup.test.tsx` injects `deps`, so it never exercises a real Supabase client. The front door could break completely with a green suite, which is exactly what happened.

`src/lib/auth-pkce.test.ts` asserts the constraint GoTrue actually applies (`^[a-zA-Z._~0-9-]+$`, 43–128, copied from `supabase/auth` `internal/api/pkce.go`) against the real client from `@/lib/supabase` with only `fetch` stubbed — `signInWithOtp`, `signUp`, and that the challenge is still the SHA-256 of the stored verifier. That third one matters: a charset fix that breaks the pair moves the failure from sign-in to the callback, later and quieter.

**Mutation-checked rather than assumed.** Patching `auth-js` to return `btoa(hashed)` without the base64url replace turns all three red with the exact string Don saw — `"RoYKE4s7XPYMK0WA/BqgJA1gwPmUtVYEhW++v3fa+to="`. Worth recording that the first attempt patched only `dist/module` and the suite stayed green; Vitest resolves `dist/main`. A mutation test that does not fail is not a test.

Verified: `unit tests only`. Tests: 3 new, all mutation-checked. Auth-adjacent suites green (5 files, 60 tests). eslint clean; `tsc` at baseline — the same 3 pre-existing errors, all in `tests/migrations-t042.test.ts`.
