# #547 — the nightly's own bugs (2026-10-10)

Three tap steps could not pass, and they were not slow screens:
- **Report: Page menu → report** waited for `report-entry`, an id that exists only in the admin screen; a signed-out reader's Page menu item is a sign-in link. The step now taps the menu item by name and ends on the login screen.
- **You → Following list** was marked optional but nothing honoured it; an account that follows nothing has no link, so it timed out. Optional steps now skip when the thing is absent.
- **Creator: post composer opens** never got ready: tapping Announce on the Page itself changes the fragment with pushState, which fires no `hashchange`, so the form did not open (a real owner-facing defect, not only a test one). Tapping the link now opens it; the test taps the way next/link does and was seen failing first.
