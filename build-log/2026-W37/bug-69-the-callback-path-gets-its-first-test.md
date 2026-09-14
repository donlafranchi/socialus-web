### bug #69 — The callback path gets its first test

Don's second sign-in failure, in a private window: *"PKCE code verifier not found in storage."* **A different bug from #67**, not a second symptom of it — #67 is the first request rejected before any mail is sent, this is the last step after a link is opened. Neither can cause the other, and #67 stays open.

**The storage hypothesis is disproven, by inspection rather than grep.** Every client in `src/` comes from `@supabase/ssr` — 16 `createBrowserClient`, 2 `createServerClient` — and nothing imports `createClient` from `@supabase/supabase-js`. The callback builds through `@/lib/supabase-server`, cookie adapter wired. #68's test reads the verifier back out of `document.cookie`, so it is a cookie and not `localStorage`. The verifier is written correctly; it is simply absent from the context that opens the link.

**The real defect is that `route.ts`'s `token_hash` branch cannot be reached.** Its comment says it covers the opened-elsewhere case. Supabase's default Magic Link template emits `{{ .ConfirmationURL }}`, a PKCE `?code=` link; `token_hash` appears only if the template is changed. So the one path that tolerates a link opened in any browser is dead in production, untested, behind a comment claiming otherwise. The fix is two dashboard changes (email template → token hash; preview wildcard in Redirect URLs), not code — `verifyOtp` is already implemented and correct.

`src/app/auth/callback/route.test.ts`: 9 tests over both branches, the otp type coming off the link, the no-token and expired-link messages, the failed exchange landing somewhere that explains itself, and `next` not being usable as an open redirect. The load-bearing one asserts the route builds through the cookie-backed server client — swapping in a raw client is one import line, looks harmless, and makes every exchange fail with exactly the error Don saw.

**Mutation-checked.** Hardcoding the otp type reddens 2; dropping `safeNext` reddens 1; swapping in a raw `supabase-js` client reddens 6 including the guard.

Verified: `unit tests only`. Tests: 9 new. Auth suites green (3 files, 24 tests). eslint clean; `tsc` at baseline — same 3 pre-existing errors in `tests/migrations-t042.test.ts`.

**Deploy is not complete at merge.** No migration this ticket.
