# bug #211 · Clicking an announcement lands on the Page with no way to find it

Don, on #204's preview: *"it takes me to the page but there isn't the
announcement information on the page."*

## First: the Page does render announcements

Ruled out before changing anything. Production, signed out, phone viewport:
the Announcements heading and all three announcements are **above the fold**.
`browse_feed` is `security invoker`, so the feed and the Page read through the
same RLS and cannot disagree about what exists.

So it is *"somewhere he didn't see"*, and there were two causes.

## Cause 1 — the link threw away which announcement it was

`href="/g/sacriver-floaters-10bd14ac-3k8x0p"`. No fragment, no announcement.

**And Don owns that Page**, which turns an annoyance into a dead end: for an
owner `canPost` is true and the composer — textarea, date, time, place
control, audience switch, button — renders *between* the heading and the list.
He landed on his own Page and got a compose box where the announcement should
have been.

Fixed by `resultHref`: an announcement row links to
`…#announcement-<id>`, a Page row is unchanged, and a row with no Page address
still gets `null` rather than a bare `#announcement-…` — a link that looks live
and goes nowhere is worse than no link.

`PagePosts` gives each announcement that id, and on mount reads the fragment,
marks the one named, and scrolls it into view. The browser's own fragment
scrolling is not enough: the list is a client component below a server one, so
it does not exist when the browser goes looking.

**Deliberately not touched: the composer's placement.** That is F072's
(*"saying something and seeing it are the same place"*) and moving it is a
scenario question. Landing on the announcement makes its position stop
mattering.

## Cause 2 — the card and the Page disagreed about what day it was

| | showed |
|---|---|
| Explore card | THU, SEP 24, 2:12 AM |
| the Page | Wednesday, September 23 at 7:12pm |

Same instant. The card formatted in the reader's **device** timezone, the Page
in the **metro's**. Tapping "Thursday" and landing on "Wednesday" is a good
reason to think the information is missing.

The card now uses `formatMetroDateTime`. An event happens in the metro's time
whoever is reading about it — someone in London wants to know when to be at the
river, not what their own clock will say. `suppressHydrationWarning` is gone,
and its absence is load-bearing: server and browser now render the same string,
so a mismatch is a real bug and should shout.

Not #173, which makes `METRO_TIME_ZONE` per-metro. This is one surface using
the wrong zone.

## The test could not see cause 2, and that is its own finding

The first version of the card test **passed against the bug**.
`METRO_TIME_ZONE` is `America/Los_Angeles` and so is this laptop, so
device-local and metro time produce identical strings here. The bug was
invisible on every machine anyone runs tests on and visible everywhere else.

`vitest.config.ts` now pins `process.env.TZ = 'UTC'`. UTC because **CI runs
UTC** — pinning to the metro zone would make the suite agree with this laptop
and disagree with CI, which is the wrong way round. With it pinned the test
goes red against the old code, which is the only reason to trust it green
against the new.

Blast radius of the pin: none. 2462 passed.

## One thing worth keeping

The first version of the scroll threw in jsdom — `scrollIntoView` does not
exist there — and the throw took the **highlight** down with it, because both
lived in one effect. It is now an optional call, and the reasoning is in the
code: the mark is what identifies the announcement, the scroll is an aid. A
test asserts the mark survives in an environment with no `scrollIntoView`.

## Suite

2462 passed. One known flake — `migrations-pending-parse.test.ts` at 5459ms
against 5000ms, seventh today, still queued separately.
