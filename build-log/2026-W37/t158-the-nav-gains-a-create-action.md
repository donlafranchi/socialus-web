### T158 (#55) — The nav gains a create action

**Most of this ticket was void before it started.** It was *"the nav goes to two tabs and a create action"*; the two-tab merge was rescinded on 2026-09-12 (Don: *"we rescinded that decision to make the launch date"*). The code already shipped three tabs, so the tab-reduction half needed no work and must not be done. **What was left is the half that was never about tab count:** create is first class, and the `+` was missing.

`Home · Explore · Create · You` in the bottom bar, and the same action in the desktop nav. Routes at `/you/sell` — the existing create entry. **It opens no new door**, and what the `+` should eventually open (sheet vs. page) is a ratified-as-open question left unanswered.

**One implementation mistake caught by its own tests, worth recording.** The first cut gave the three tabs `role="tab"` to make "is a link, not a tab" literal and testable. That is **invalid ARIA** — `role="tab"` is only valid inside a `tablist`, and there is none here; a `nav` of links is the correct pattern. It also broke four existing tests that find tabs by link role, which is what surfaced it. Reverted: no ARIA tab roles anywhere in the bar, and what distinguishes the create action is that it carries neither `aria-current` nor `data-active` — the two markers a tab uses to say *you are here*. **The accessibility criterion was right and the first way of satisfying it was wrong.**

**Peer geometry, never peer state.** Same 20px/1.5-stroke icon, same 9px/medium label, same full-height touch target, so the row reads as one row — but no active treatment, because there is no sense in which a member is *on* create.

**Two judgment calls, both stated rather than assumed.** Placement: the spec said *between the tabs*, and three tabs give two interior slots; chose the one that keeps You last, which is the order members already have. Treatment: **peer, not raised.** A raised accent circle would be a new visual component and would spend the one-primary-button budget — that is a design decision, and the ticket says to escalate rather than pick one, so the conservative reading ships and the raised option stays open.

`TopNavDesktop` had no test before this, because it renders `AuthCtaButtons`, which builds a Supabase client and needs project env vars. Mocked at the module boundary — this file tests nav structure, not auth.

Verified: `unit tests only`, plus the rendered nav at 375×812 against a dev server pointed at local Supabase. Tests: 13 new, 2 existing updated for the fourth link. Full suite: **132 files, 1576 tests, all passing, nothing skipped.** tsc/eslint at baseline.
