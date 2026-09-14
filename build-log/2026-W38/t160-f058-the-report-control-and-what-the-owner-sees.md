# T160 (Issue #62) — the report control, and what the owner sees

**Scenario:** F058 — a member reports something, and the operator can take a photo down.
**Depends on:** #13 / #65 (schema), T159 / #61 (handler). **Blocks:** nothing.

> Stacked on `f058-t159-report-create`, because #61 is not merged — it carries a
> privacy deviation that needs Don. Nothing here changes if #61 merges as-is.

## What shipped

- `PageOverflowMenu` — the ⋯. A container that takes its items, not a Report
  button in a menu costume, because the pattern will spread. Accessible name
  *"More options"*, `role="menu"` / `role="menuitem"`, Escape and outside-click
  close, and an item that is a button when signed in and a link to sign-in when
  not.
- `ReportSheet` — the T115 bottom-sheet recipe unmodified. *"This goes to a
  person, not a queue."*, a text area, **Send**. Focus trapped, Escape closes,
  body scroll locked.
- `ReportControl` — wires the two together and is the only file that knows F058
  exists.
- `sendReportAction` — `createClient` → `getUser` → `resolveActionContext` →
  `reportCreate`, following `group-membership-actions.ts`.
- `HiddenPhotoNotice` — the owner's notice. **Takes no props at all**, which is
  the strongest form of "never names the reporter": there is no parameter
  through which an identity or a report body could reach it, now or after a
  refactor.
- `resolveShop` gains `photoUrl` / `photoHiddenAt`; new `viewerOwnsPage()`.

The Page reads the photo through `visiblePhotoUrl()` (T159), never
`photo_url` directly. The owner sees the notice; everyone else sees exactly
what a photoless Page shows.

## Two things found while building

**1. The confirmation broke the header.** Rendered inline it became a flex
sibling of the ⋯ and squeezed the Page title onto two lines. It is now a fixed
bottom banner — out of flow, so it cannot do that to any surface that hosts the
control, and bottom is where the thumb already is. Regression test added.

**2. `--color-control-border`, a new token.** The sheet's text area had a
`--color-charcoal-100` border: 1.23:1 on white. WCAG 1.4.11 wants ≥ 3:1 for
anything you must find in order to operate it. charcoal-100 is right for a
hairline separator and wrong for the edge of a box you type in, so the two
roles are now two tokens. `#8a8a8a`, 3.45:1.

## Accessibility review — `design:accessibility-review`, fired

Measured live at 375×812 against the production build, by sampling painted
pixels (Tailwind v4 emits `lab()`, which a naive contrast parser reads wrong —
the first pass produced two false failures before that was caught).

| Check | Result |
|---|---|
| Touch targets (2.5.5) | ⋯ 44×44, menu item 222×44, Send 343×44, Close 44×44 |
| Text contrast (1.4.3) | notice 13.57 / 7.49, menu 14.16, hint 14.16, title 14.16, Send 11.03 |
| Control boundary (1.4.11) | text area border **3.45** after the token fix (was 1.23) |
| Name/role/value (4.1.2) | ⋯ named, `aria-haspopup`, `aria-expanded`; dialog `aria-modal` + labelled + described |
| Labels (3.3.2) | text area has a real `<label for>` |
| Keyboard (2.1.1, 2.4.3) | Tab wraps inside the sheet; Escape closes; focus returns to the ⋯; body scroll restored |
| Focus indicator (2.4.7) | inherits the global `:focus-visible` in `--color-fg`; the accent override was **removed** — 2.9:1 on white, already flagged in T115 |

**Known limit, commented in the component:** no arrow-key roving tabindex
between menu items. ARIA's menu pattern expects one; with a single item it is
invisible, with two it is a real gap.

## Verification

**local Postgres + the running app.** Signed in as a real Page owner against
local Supabase and drove the whole path in the browser:

- Report sent → `reports` row stored, `group.reported` written, `photo_hidden_at`
  set, `group.photo_hidden` written. Confirmed in the database.
- Reported the same Page a second time as the same member → the row stored and
  **no second hide, no second event**. T159's first limit, observed in the real
  app rather than only in a mock.
- Owner sees the notice; the same Page signed out shows no photo, no notice, and
  no hint that either exists.
- Full suite **1732 passing, 0 failing** (1695 on #61's branch; 37 new). `tsc` clean in these files; `lint`
  unchanged from baseline; `npm run build` passes.

**Note on the dev server:** the ⋯ would not hydrate under `next dev` on this
host (the HMR websocket could not connect). It works under `npm run build &&
npm start`, which is what everything above was verified against. Recorded
because it will waste someone's afternoon otherwise; it is not a defect in this
change.

## v1 limits, recorded not fixed

- **The owner notice is in-app, not a push.** There is no email substrate —
  `RESEND_API_KEY` sits in `.env.local.example` and nothing in `src/` reads it.
  "Told immediately" means "unmissable the moment they next open their Page."
- **`design-language.md` carries no picker recipe**, though #62 says the ⋯ gets
  named by one. It also lives in `ops-pattern`, which this repo must not commit
  to. Built to the house patterns and raised on the issue for naming upstream.
- **T145 (#26) and T146 (#27) are still open**, so there is no photo frame and
  no default art yet. "Everyone else sees what a Page with no photo sees" holds
  today (nothing) and will hold unchanged when T146 lands.
