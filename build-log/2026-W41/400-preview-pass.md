### change #400 — the operator preview pass

Don, 2026-10-05: every preview is its own domain, so he signed in by email on each one.

- `GET /api/preview-signin?token=…&next=/path` signs in `PREVIEW_PASS_EMAIL` on a preview deployment when `PREVIEW_PASS_TOKEN` matches (constant-time, 24+ characters). Everything else — production, a wrong token, a missing env var, a failed sign-in — is the same plain 404.
- The one-time sign-in token is minted in `src/actions/_lib/preview-pass-link.ts` with `SUPABASE_SECRET_KEY` (Rule 1 keeps the key there); nothing is emailed.
- A `su_preview_pass` cookie records which token and when; the proxy signs out a pass session after 30 days or once the token changes. Ordinary sessions are untouched.
- Needs three Preview-only env vars set by Don: `PREVIEW_PASS_TOKEN`, `PREVIEW_PASS_EMAIL`, and `SUPABASE_SECRET_KEY` extended to Preview. Without them the route is a 404 everywhere.

Tests: `src/lib/auth/preview-pass.test.ts`, `src/app/api/preview-signin/route.test.ts`, `src/proxy.test.ts`; removing the preview-only check fails two of them.
