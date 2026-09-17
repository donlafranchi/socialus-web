# change — cards are uniform, always carry a location, and the lift is shared

**Kind:** change. **Scenario:** none. Don's review of the card gallery,
2026-09-17. Five pieces of feedback, all fixed in the card system rather than
the gallery.

## 1 · Uniform height

Every text row now **reserves** its space: two lines for the title, two for the
tagline, one for the location, in `em` so they track their own line-height
rather than a pixel count that drifts with the type scale.

Reserving, not stretching. `align-items: stretch` only equalises within a row,
and Don wants every card the same — a one-word title and a wrapping one produce
the same card, photo or no photo, long location or short.

**Measured**, on a gallery deliberately loaded with uneven content (a title that
wraps, one that does not, a card with no tagline, every location scale, a photo
and the emoji fallback):

| viewport | tiles | heights | uniform |
|---|---|---|---|
| 320px | 6 | 378px | ✅ one value |
| 1280px | 6 | 344px | ✅ one value |
| 2560px | 6 (10 columns) | 345px | ✅ one value |

## 2 · Every card has a location

`location` is a **required prop**, not an optional line. The always-present slot
is what makes the height deterministic, and `online` is a value rather than an
absence.

**The vocabulary is ratified, not invented.** Don said "World Wide Web"; the
term already ruled is **Online**, and the scale already exists:

- `surfaces.md` § Distance is out *(2026-09-03)* — *"Ordering is hood → metro →
  wider → online."*
- `surfaces.md` § Online is a first-class location option *(2026-09-03)* —
  *"online Items never render on the map"*, and the composer must warn it ranks
  last.
- `item.md` — *"an Item's own location (address, neighbourhood, or Online)"*.
- `nouns.md` *(2026-09-09)* — street address if specific, neighbourhood
  otherwise; Place is *"neighbourhood → state"*, where `wider` sits.

So: `address · neighbourhood · metro · wider · online`. `isMappable()` is
exported from the same module so the map reads that rule rather than re-deciding
it.

## 3 · Left padding

The original's text was flush to the card edge — the image bleeds, so nothing
revealed it. `px-3` on the text block. **The image still bleeds**, deliberately:
an inset image inside an inset text block reads as a card inside a card.

## 4 · No underline

The global `a:hover { text-decoration: underline }` was underlining the whole
card, image included. Scoped off for `.card` only — a link inside a paragraph
still underlines, because there it is the only signal.

**The affordance is replaced, not dropped:** the lift, plus the card's title
shifting to the accent colour on hover anywhere on the card. Colour and motion
instead of a line.

## 5 · More of the lift, shared

One `@utility lift` plus four tokens — `--lift-distance`, `--lift-shadow`,
`--lift-duration`, `--lift-ease`. Applied to `.card-hover`, `.btn-primary`,
`.btn-secondary`, `.chip`, and the map sheet's close control. Adding it to a new
surface is one class; changing the feel is one edit.

`:active` collapses the lift, so a press feels like a press.
`prefers-reduced-motion` removes the motion and keeps the colour transitions —
those are the affordance, not the decoration.

**`@utility`, not a plain class.** `.lift {}` compiles but fails at
`@apply lift` with *"Cannot apply unknown utility class"* — which is exactly
what happened on the first attempt, and why the gallery 500'd until it was
declared properly.

## Verification

36 tests. The new ones assert the design facts rather than describing them:
reserved line heights, the same row set for the emptiest and fullest card, a
location line for every scale including online, `px-3` on text but not the
image, no underline on the link, and the accent-on-hover replacement.

`tsc` clean · lint 0 errors · build succeeds · checked in a real browser at
320px, 1280px and 2560px, with per-grid height uniformity measured rather than
assumed.
