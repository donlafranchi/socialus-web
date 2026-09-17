# the card system — the recovered cards, made fluid

**Kind:** change. **Scenario:** none.
**Source of the design:** the recovered components at `ccbf54d` and `4db3670`,
read directly. Not the design-archive page — Don pointed out that page
re-implemented the markup inline and had drifted from the originals, so this
went back to the sources.

## What is reusable now

`@/components/cards` — `Card`, `CardGrid`, `TileCard`, `AnnouncementCard`,
`StatusDot`, `MetricTile`.

## The fluid change, which is the whole point

The recovered `VendorCard` was `flex-shrink-0 w-56` — a fixed 224px tile built
for a horizontal scroller. It cannot meet "27-inch monitor down to iPhone mini"
and no breakpoint fixes it: breakpoints pick winners at three widths and are
wrong at every other one.

One rule replaces it, with no media queries anywhere:

```
repeat(auto-fill, minmax(min(100%, 14rem), 1fr))
```

- `min(100%, 14rem)` — the floor is 224px **or the whole container, whichever is
  smaller**. That `min()` is what stops a 224px minimum overflowing the ~288px
  of usable width on a 320px phone.
- `auto-fill` + `1fr` — columns appear as width allows and share the remainder.

**Measured, not asserted** (`getBoundingClientRect` in a real browser):

| viewport | columns | card | image | emoji | h-overflow |
|---|---|---|---|---|---|
| 320px | 1 | 288px | 288×192 | 49px | none |
| 2560px | 10 | 238px | 238×159 | 41px | none |

Two changes fall out of being fluid:

- **The image is `aspect-[3/2]`, not `h-32`.** A fixed height on a card that now
  varies in width distorts the crop at both extremes. A ratio holds the
  composition everywhere, which is also what keeps the emoji state exactly as
  tall as a photo so a row still lines up.
- **The emoji uses container-query units**, `clamp(2rem, 17cqw, 4rem)`. The
  original's 30px inside a 128px block is about a quarter of its height; 17cqw
  holds that proportion at every card width. `cqw` and not `vw` because the same
  tile is 288px on a phone and 238px in a ten-column grid, and a viewport unit
  cannot tell those apart. First pass used 9cqw and looked visibly wrong at
  320px — caught by looking at it.

## Preserved deliberately

No borders anywhere — the separation is white on `#f7f6f2` plus a hover shadow
with a 2px lift (both together; either alone reads wrong). The image block keeps
its own `rounded-xl` inside the card's. The emoji empty state on the surface
colour, never a grey box. Teal `#0fab8e` for the announcement attribution, which
does the job a photo does elsewhere. `MetricTile.deltaLabel` takes a **sentence**,
so "No activity yet" is expressible and a bare `0%` is not the easy path.

`StatusDot` is the old `OwnershipBadge` renamed — a 12px dot plus a full
sentence, never a pill. Ownership tier was a vendor concept and is retired; the
shape outlives it. The colour is `aria-hidden` and never the only signal.

## The bottom sheet is not here

`BusinessDetailCard`'s sheet is not a card: it is a positioned overlay that
assumes a full-bleed surface behind it and owns its own scroll. Generalising it
would mean inventing an API for something with exactly one caller. It stays
inside `PageDetailCard` until a second surface wants one.

## Verification

19 tests asserting the design facts rather than describing them — no fixed
width, no border, hover only when it is a link, ratio not height, emoji
fallback, identical height with and without a photo, clamps, accent
attribution, written delta. `tsc` clean · lint 0 errors · build succeeds.

Checked in a real browser at 320px and 2560px; the numbers above are from that
run, not from reasoning about the CSS.
