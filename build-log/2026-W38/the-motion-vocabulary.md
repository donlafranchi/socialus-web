# The motion vocabulary — four gestures, one set of tokens

*2026-09-17. The last of Don's card feedback, and the only one that was still unbuilt.*

## What he actually asked for

After the card lift shipped he said **"more of that."** That was read as *more
elevation* and it meant **more of that KIND of feedback** — per element, each
appropriate to what the element is. One `lift` applied to cards, buttons, rows
and pills alike is a single gesture copy-pasted, and it makes a button feel
like a card and a list row feel like neither.

## Four gestures

| Utility | Element | What it does | Why not the others |
|---|---|---|---|
| `lift` | a **card** | rises 2px, casts a shadow | it's a surface; surfaces have shadows |
| `press` | a **button**, chip, pill | scales to 0.97 under the finger, colour on hover | a button that rises reads as a card — a button is a thing you push |
| `nudge` | a **row** in a list | slides 3px sideways | a row has neighbours above and below; sideways is the only direction with room, and it's the direction the row leads |
| `reacts` | an **icon** inside a control | scales to 1.12 | answers the pointer slightly ahead of the control around it |

Timing and easing are shared — `--motion-duration`, `--motion-ease` — which is
what keeps four gestures reading as one product rather than four.

## Two decisions worth keeping

**Individual transform properties, never the `transform` shorthand.** A
scroll-responsive header that shrinks as you scroll (the Airbnb behaviour Don
has pointed at) wants to drive `scale` while hover drives `translate`. With the
shorthand those fight: whoever writes last wins and the other is silently lost.
`translate:` and `scale:` compose, so scroll-shrink can land later without
rewriting any of this. A test asserts no gesture uses the shorthand.

**`reacts` reads an inherited custom property, not a `:hover` of its own.**
Hovering the button sets `--icon-scale` on the button; the value inherits down
and the icon animates. No `group-hover:` re-typed per component, no requirement
that the icon be a direct child, and the hover target stays the whole control
rather than the few pixels of the glyph.

## Reduced motion

Honoured per utility, and it **removes** movement rather than shortening it.
Colour transitions stay — they're the affordance; the motion is the decoration.

## Verified in the browser, not only asserted

On one hover of a gallery card, measured live:

- the card: `translate: 0px -2px`, shadow applied, `--icon-scale: 1.12` published
- the Follow chip inside it: `translate: none`, `scale: none`, background moves to `#f7f6f2`

Two different gestures on the same hover, which is the whole point. The location
pill on Browse: `translate: none` on the pill, `scale: 1.12` on its map pin.

## The other four card fixes

Uniform height, required location, left padding and no hover underline all
shipped earlier in the card system work. This entry completes the set.

## Checks

`tsc` clean · `npm run build` passes and the utilities emit real CSS (checked in
the built stylesheet, not just the source) · 581 component tests pass · 12 new
tests assert the gestures stay different from each other.
