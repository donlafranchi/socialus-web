# The edit screen says a new photo needs saving, and the save stays in sight

*2026-09-28. bug · #237.*

## What was wrong

Save changes existed, always rendered and enabled — at the very bottom of the
form, a full phone screen below the photo, after seven social-link fields. The
preview appeared the moment an upload finished, which reads as done. "Done"
beside Save was a plain link that dropped the photo silently. The photo
heading "Photo" was printed twice.

## The fix

- The Save / Done row is pinned to the bottom of the screen (`sticky`, `z-50`,
  above the mobile bottom nav, which is `z-40` and slides back on scroll up).
- An unsaved photo says *"This photo is not on your Page yet. Press Save
  changes at the bottom to put it there."* — gone once saved. Removing a saved
  photo says the reverse.
- With an unsaved photo, "Done" reads "Leave without saving".
- "Photo" is printed once. The picker's own button came separately, in #235.

## How it was checked

Four new tests red against main's form, green after. The real form
at 375×812 in the browser, before and after: before, Save was 596px below the
photo control with nothing pointing to it; after, the bar is in view from the
top of the page to the bottom, and the notice appears on upload.
