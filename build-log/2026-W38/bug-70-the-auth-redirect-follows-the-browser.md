# bug #70 — the auth redirect follows the browser, not the canonical host

**Kind:** bug. **Scenario:** none.
**Related:** #69 and #74 (both closed 2026-09-15) — same symptom, different mechanism.

## The symptom

Sign-in works on socialus.org and fails on a Vercel preview with "PKCE code
verifier not found in storage".

## What the code was doing

The verifier is a **host-only cookie**. `createBrowserClient` writes it through
`document.cookie` with no `Domain` attribute, so it belongs to the exact origin
sign-in started on and to no other. The code can only be redeemed there.

`src/lib/site-url.ts` had one function serving two jobs that want opposite
answers:

- a **published** link (OG tag, share URL) wants the canonical host, whatever
  machine rendered it;
- an **auth redirect** is not published — it must name the host holding the
  verifier, which is the host the browser is actually on.

Two ways that produced a wrong host:

1. `NEXT_PUBLIC_SITE_URL` is documented as Production scope
   (`INFRASTRUCTURE.md` § Environment variables), but Vercel's default when
   adding a variable is **All Environments**. Scoped that way it is also set on
   preview, and `authRedirectUrl()` returned the canonical host while the
   browser sat on `*.vercel.app`. Verifier written on the preview host, link
   back to production, which holds no verifier.
2. Server-side, `VERCEL_PROJECT_PRODUCTION_URL` was consulted before
   `VERCEL_URL`. Vercel sets the former on **every** environment — it names the
   project's production domain, not the deployment being rendered — so a preview
   render resolved to the production origin too. That one also mislabels OG tags
   and share links on previews.

## What changed

`src/lib/site-url.ts`:

- `authRedirectUrl()` now resolves through `authOrigin()`, which prefers
  `window.location.origin` and falls back to `siteOrigin()` on the server. The
  auth redirect follows the browser.
- `siteOrigin()` keeps canonical-first behaviour for published links, and its
  Vercel fallback now prefers `VERCEL_URL` unless `VERCEL_ENV === 'production'`.

## What this does NOT fix

**The Supabase Redirect URLs allowlist is still the load-bearing setting**, and
it is not code. Supabase honours `redirectTo` only when it matches the
allowlist; when it does not, GoTrue silently substitutes the dashboard Site URL
— production — and the symptom is identical to the bug fixed here. That is #74
Step 2, `https://*-socialus.vercel.app/**`.

So this change removes one of two independent causes. If preview sign-in still
fails after it, the remaining suspects, in order:

1. The allowlist entry does not match the actual preview hostname. Read the host
   of the link in the email **before opening it**: if it is `www.socialus.org`
   rather than the preview host, GoTrue substituted, and the pattern is wrong.
2. Vercel Deployment Protection on previews. If it is on, the emailed callback
   link opened in a phone mail app hits the Vercel SSO wall instead of
   `/auth/callback`, which breaks preview sign-in on its own and has nothing to
   do with Supabase.
3. The Magic Link template (#74 Step 1). If it still emits
   `{{ .ConfirmationURL }}`, every email is a PKCE `?code=` link and the
   `token_hash` branch in the callback stays unreachable. Google OAuth is PKCE
   regardless of the template.

## Verification

`src/lib/site-url.test.ts` — five new assertions, two of which failed before the
change and pass after:

- auth redirect uses the browser origin on a preview even when a canonical site
  URL is configured **(was failing)**;
- server-side origin on a preview resolves to this deployment, not the project
  production domain **(was failing)**;
- auth redirect still canonical in production, where browser and canonical agree;
- published links stay canonical on a preview;
- server-side origin still production on a production deployment.

Two existing `authRedirectUrl` assertions were updated: they asserted the
canonical origin with no window stubbed, which encoded the bug. Their intent —
callback path and `next` encoding — is preserved, with the browser now stated to
be on the canonical host.

Unit tests only. Not verified against a live preview: that needs the Supabase
setting above and a deploy, neither of which is reachable from here.
