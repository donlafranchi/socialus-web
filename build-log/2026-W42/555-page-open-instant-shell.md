# bug #555: opening a Page from a card answers at once (the standard pattern)

Dispatch call (2026-10-12), Path: well-worn. The nightly's slow taps are the Explore card or post card to a Page: nothing on screen until the server has resolved the Page (~1.7 to 2.3 s on a cold read).

- **Optimistic shell from the card.** `HandoffLink` (used by every card): while its navigation is pending, the Page's shell (its name, kind line and photo, taken from what the card already carries, in outline) covers the screen, in a portal so a lifted card cannot clip it. It goes when the Page arrives.
- **Prefetch on intent.** Hover, focus and a finger resting on a card read the whole Page ahead of the tap (the router caches a full prefetch for 5 minutes by default); the top three cards still read it ahead.
- **No route loading boundary, deliberately.** A first attempt added `loading.tsx` to `/g/[handle]`; CI showed it breaks F035 beat 6 (a draft Page must answer 404 to non-owners). A boundary streams a 200 before the Page is resolved, which is the status honesty #537 protects. The shell is drawn from the card instead, so a hard load of a draft or missing Page still answers 404. Also dropped: a `staleTimes` change (it only caches visited pages, and F042 beat 7 flaked on stale counts).

The nightly's "content" is the real Page header with no `aria-busy`, so the shell is feedback, not content: the 1 s budget is met only if the full read is faster, and the full prefetch (top three, hover, touch) is what moves it. The server read was already one round per stage (#529) and is untouched. Confirm on the next nightly; if a tap still misses 1 s, the remaining lever is caching the signed-out Page read.
