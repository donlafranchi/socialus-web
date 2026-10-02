### chore #295 — a check that fails on one-off visual values outside the token file

- **`src/lib/design/visual-tokens-check.ts`** finds Tailwind arbitrary values for size, spacing, radius, shadow and type (`p-[13px]`, `rounded-[10px]`, `text-[15px]`, `shadow-[…]`) and px/rem lengths in inline styles. Colour is out of scope; tokens and `var(--color-…)` pass.
- **A ratchet:** `visual-tokens-baseline.json` lists the 71 one-offs in the tree today, count by count, each to be removed as its screen moves to the new templates. A value not in the baseline fails, and so does a baseline entry the tree no longer has, so the list only shrinks.
- **Runs in `npm test`** (`tests/visual-tokens.test.ts`); `tsx scripts/visual-tokens.ts` reports, and `--write-baseline` exists only to shrink the list.
- **Cleared on the way, no visual change:** `min-h-[44px]` → `min-h-tap` (11) and `rounded-[--radius-md]` → `rounded-md`.

Proven failing: 83 violations against an empty baseline; one new `p-[13px]` fails against the real one. No migration.
