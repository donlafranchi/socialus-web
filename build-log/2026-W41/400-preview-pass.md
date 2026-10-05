### change #400 — the operator preview pass

Don, 2026-10-05: every preview is its own domain, so he signed in by email on each one.

- `GET /api/preview-signin?token=…&next=/path` signs in `PREVIEW_PASS_EMAIL` on a preview deployment when `PREVIEW_PASS_TOKEN` matches (constant-time, 24+ characters). Everything else — production, a wrong token, a missing env var, a failed sign-in — is the same plain 404.
- The one-time sign-in token is minted in `src/actions/_lib/preview-pass-link.ts` with `SUPABASE_SECRET_KEY` (Rule 1 keeps the key there); nothing is emailed.
- **The limits live in Supabase**, after the security review found a cookie-only check could be deleted or copied around: the new session's `auth.sessions.not_after` is 30 days out and its `tag` is the token's fingerprint; each pass sign-in deletes every pass session for that account from another token. If sealing fails, the new session is deleted and the route 404s. An access token already issued lives out its hour.
- `safeNext` now refuses control characters and whitespace, which `new URL()` strips into an off-site path (`/\t/evil.example`), found by the same review.
- Needs three Preview-only env vars, set by Don: `PREVIEW_PASS_TOKEN`, `PREVIEW_PASS_EMAIL`, and `SUPABASE_SECRET_KEY` extended to Preview. Without them the route is a 404 everywhere.

Tests: `src/lib/auth/preview-pass.test.ts`, `src/app/api/preview-signin/route.test.ts`, `src/lib/safe-next.test.ts`, `tests/preview-pass-db.test.ts` (against Postgres in CI). Removing the preview-only check fails two of them.
