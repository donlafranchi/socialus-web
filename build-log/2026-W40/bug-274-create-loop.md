### bug #274 — Create looped

Found in the 2026-10-01 screen inventory. For anyone without an active business Page, Create went to `/you/sell`, which redirected to `/you`, whose empty state says "Tap Create".

- Create (bottom bar and desktop top bar) goes to `/you?create=1`.
- `SellCta` takes `autoOpen`. Once its routing signal resolves, it does what tapping it would: the Page walkthrough, or the sell index for someone who already runs a business Page. The walkthrough's open state is derived, so closing it stays closed.
- `/you/sell`'s no-Page redirect goes to `/you?create=1`.

Tests seen failing first: the nav's Create link (bottom and desktop) and `SellCta` opened from Create (walkthrough, sell index, stays closed otherwise). No migration.
