# bug #405 — the sign-in link and sessions that don't last

- The proxy built its response before refreshing, so the page rendering kept the spent refresh token and spent it again, which revokes the session. It now rebuilds the response from the updated request (Supabase's Next.js pattern).
- A stale session no longer takes the PKCE code verifier with it, so a link requested from that browser still exchanges at the callback.
- A sign-in code that lands on any page other than the callback (Supabase's Site URL fallback) is forwarded to the callback.
- Guard: `src/app/auth/callback/stale-session.test.ts` runs the real @supabase/ssr with a stubbed network; the three proxy checks fail on the old proxy.
