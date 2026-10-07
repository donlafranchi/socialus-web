# change #444 — shared links and link previews use www.socialus.org

- Root layout sets `metadataBase` from `siteOrigin()` (new `siteMetadataBase()`), so relative metadata URLs resolve against the canonical host.
- Production needs `NEXT_PUBLIC_SITE_URL=https://www.socialus.org` in Vercel (it is the bare domain today); it is read at build time, so it takes effect on the next deploy.
- Guard: `site-url.test.ts` § #444.
