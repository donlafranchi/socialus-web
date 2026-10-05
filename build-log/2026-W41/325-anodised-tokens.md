# change #325 — the Anodised colour tokens

The `@theme` colour lines take the Anodised palette (Don, 2026-10-04): blue 50–950 and gold 50–800 scales; accent becomes navy blue-700 with blue-800 hover and blue-50 tint; new roles for frame, on-frame, highlight, focus and feedback (success, warning, danger — `--color-danger` was used but undefined). Focus rings are navy, gold-300 inside `.on-frame`. Every existing accent site turns navy without a sweep; element restyles (nav gold bar, date blocks, front-door card) stay out of scope.

`src/lib/design/palette-contrast.test.ts` reads the tokens from `globals.css` and checks each allowed pairing against WCAG AA; seen failing with the old teal accent (5 pairs).

**Map pins (Don, 2026-10-05):** pin, cluster and selected-pin tokens (`--color-pin`, `--color-cluster`, `--color-pin-selected`, ring and edge) and size tokens; every map draws markers through `src/lib/map-pins.ts`. All pins and clusters navy; the selected pin gold, larger and ringed in deep navy, since gold alone is 2.4:1 on the light base map. Ownership no longer colours pins. The contrast test checks pins against Mapbox light-v11's land, water, park and road colours.
