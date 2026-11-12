// The signed-out home at `/`. The copywriter's final copy (2026-10-31), with Don's 2026-11-01 changes, word for word;
// layout and look follow Don's concept of the same day.
// `TODO(Don)` marks something still pending; nothing else here changes without him.
// 2026-11-12: rewritten to the one line Don ruled on 2026-11-06 (#1271); he approves it before it ships.

export const HOME_TODO = {
  // Don, 2026-10-26: one sign-up path for everyone; the zip decides what comes after.
  primaryCta: 'Join SocialUs',
  // The PM, 2026-11-12: a visitor without an account can read everything; only hearting, following,
  // posting and reporting need one. So the pitch lets them in to look, without asking them to join first.
  lookAround: 'Look around',
}

export const LOOK_HREF = '/explore'

// The headline and the subline are two slots, and their words are Don's. The headline holds the
// 2026-11-06 line ("Locals, finding and supporting locals.": the landing page, /join and every pitch
// say it and nothing competing) until he picks the words of his 2026-11-12 concept.
// TODO(Don): headline, the "…for the people" wording he is choosing (2026-11-12).
export const MESSAGE = 'Locals, finding and supporting locals.'

// TODO(Don): consent line under the last Join button; the copywriter's final wording and its Terms/Privacy links are pending. Null leaves it off.
export const CONSENT_LINE: string | null = null

// Don's illustration (2026-10-31): the town square. The main street and the park left with the
// sections they sat beside (2026-11-12, one line and nothing competing); their files stay in public/home.
export const ART = {
  hero: {
    srcSet: '/home/square-768.webp 768w, /home/square-1200.webp 1200w, /home/square-1536.webp 1536w',
    src: '/home/square-1200.webp',
    width: 1536,
    height: 1024,
    alt: 'Illustration of a sunny town square: people talk on a bench around an olive tree, shop at a market stall, sit outside a café and walk a dog.',
  },
}

export const HOME = {
  hero: {
    // TODO(Don): subline, held until he sends the final words of his 2026-11-12 concept. Until then,
    // his own words for the line (PRINCIPLES.md, 2026-11-06), trimmed to the first sentence.
    body: 'The people of a town finding and supporting each other: business, trade, teaching, happenings, tips, every kind of local supporting local people.',
  },
  footer: {
    links: [
      { href: '/about', label: 'About' },
      // TODO(Don): add Contact here once its destination exists (the socialus.org mailbox).
      { href: '/privacy', label: 'Privacy' },
      { href: '/terms', label: 'Terms' },
    ],
  },
}

export const JOIN_HREF = '/auth/login'
