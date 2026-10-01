### bug #276 — Page edit: Done discarded unsaved changes

Found in the 2026-10-01 screen inventory. "Done" beside "Save changes" was a plain link back to the Page, so an unsaved change was lost without a word.

- The form keeps what was last saved and compares. While anything differs (or an address change is open):
  - Done becomes a button that asks, "You have unsaved changes", with "Save changes" (it submits) and "Leave without saving" (back to the Page).
  - The browser asks before the page is left or reloaded (`beforeunload`).
- A successful save resets the comparison.
- Copy is a placeholder.

Not changed: where Save sits on a long form. That's the same placement question as the List/Map toggle, held for Don's design choice.

Tests seen failing first, in `EditPageForm.test.tsx`: Done leaves straight away with nothing changed; with a change it asks; saving from the question saves; `beforeunload` is blocked while unsaved and not once saved. No migration.
