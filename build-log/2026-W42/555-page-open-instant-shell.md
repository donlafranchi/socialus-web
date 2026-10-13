# bug #555: opening a Page from a card answers at once (the standard pattern)

Dispatch call (2026-10-12), Path: well-worn. The nightly's slow taps are the Explore card or post card to a Page and the creator edit screen: nothing on screen until the server has resolved the Page (~1.7 to 2.3 s on a cold read).

- **Loading boundary.** `/g/[handle]/loading.tsx` (and `/edit`) render before the server has found the Page, and with the router's prefetch they are already on the phone when the tap lands. Until now the skeleton only appeared after the Page was resolved.
- **Optimistic shell from the card.** On the press a card hands its name, kind line and photo address (the light payload it already carries) to the Page through session storage for 30 seconds (`card-handoff`); `PageLoading` shows them at once, with the plain outline when there is none.
- **Prefetch on view and on intent.** `HandoffLink`: the router prefetches the loading shell as a card scrolls into view (its default, now useful because there is a boundary to fetch); hover, focus and a touch read the whole Page; the top three cards still read it ahead.
- **The prefetch is kept.** `experimental.staleTimes` dynamic 30 s, static 180 s: by default a dynamic page's prefetch is dropped at once, so none of the above would have survived to the tap.

The nightly's "content" is the real Page header with no `aria-busy`, so the optimistic shell does not count as content: the budget is met only if the full read is faster. The full prefetch (top three, hover, touch) is what moves that. The server read itself was already one round per stage (#529); not touched. Confirm on the next nightly; if a tap still misses 1 s the remaining lever is caching the signed-out Page read.

Trade-off: a visited or prefetched dynamic page can be up to 30 s old when returned to by navigation; a server action that changes data refreshes the router.
