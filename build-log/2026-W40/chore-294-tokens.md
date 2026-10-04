### chore #294 — design foundations: the tokens, no colour

`socialus-owner-page-design/socialus-tokens.css` is adopted into `globals.css`. Colours are untouched (Don, 2026-10-01).

- **Breakpoints** 640 / 744 / 1024 / 1280 / 1536. `md` moves 768 → 744, so iPad portrait gets the top nav, as ruled.
- **Type:** micro, caption, body-sm, body, title-3/2/1, title-1-lg, display. These are additive; `text-sm`/`text-xs` keep working until each screen moves.
- **Radius** sm 6, md 12, lg 16, xl 24, full. The same PR swaps every corner so nothing changes size: `rounded-xl` → `rounded-md` (12) in 39 places plus `.btn-primary`, `.btn-secondary` and `.card`; `rounded-2xl` → `rounded-lg` and `rounded-t-2xl` → `rounded-t-lg` (16).
- **Shadows:** lift, overlay and bar replace `shadow-md`, `shadow-lg` and the nine arbitrary `shadow-[…]`. Upward sheet shadows become `shadow-bar`, slightly lighter.
- **Widths** auth, form, read, detail and shell (1680); `tap` and nav heights; easing and durations; one z-layer scale; `gutter` and `pb-nav` utilities; reduced motion.
- **Not here:** the nav height moving 44 → 56, which is the shell (#296). `--nav-height` stays until then.

Tests unchanged in behaviour (1542 in `src` pass); production build passes; the built CSS carries the new breakpoints. No migration.
