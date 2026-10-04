### change #296 — the page shell: one nav, header, footer and content cap

- **Phone (0–743):** the bottom nav is 56px (`--nav-bottom-h`, and `--nav-height` follows it). Labels are 12px (micro), the type floor; 9px is gone.
- **744 and up:** a 64px header, Explore · Create · You, the same order as the phone. Explore's sticky row and the map column sit under it by token.
- **No nav** (bottom or top) and no footer on /auth, /onboarding or /admin.
- **Footer from 744:** © SocialUs · About · Terms · Privacy, pinned to the bottom of short pages.
- **Content cap:** 1680, centred above that.
- **Text pages (L27):** /about, /terms and /privacy read `src/lib/text-pages.ts`, next to the copy module. Terms and Privacy are placeholders ("This page is being written. It is not yet in effect."). No legal text; Don's drafts replace them there. About carries the signup line.
- **Not found (L23) and the error state (L26):** one `EmptyState` (what happened, one way on), used by `not-found.tsx` and `error.tsx`.
- **The token baseline** shrinks by 13; no new one-offs.

Tests: the nav, footer, empty state and text pages were seen failing first; older nav tests updated from 44px/9px to the spec. No migration.
