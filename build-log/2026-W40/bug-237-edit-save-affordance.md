# The edit screen says a new photo needs saving, and the save stays in sight

*2026-09-28. bug · #237.*

## What was wrong

Save changes existed, always rendered and enabled — at the very bottom of the
form, a full phone screen below the photo, after seven social-link fields. The
preview appeared the moment an upload finished, which reads as done. "Done"
beside Save was a plain link that dropped the photo silently. The photo
control was the browser's bare "Choose File", under "Photo" printed twice.

## The fix

- The Save / Done row is pinned to the bottom of the screen (`sticky`, `z-50`,
  above the mobile bottom nav, which is `z-40` and slides back on scroll up).
- An unsaved photo says *"This photo is not on your Page yet. Press Save
  changes at the bottom to put it there."* — gone once saved. Removing a saved
  photo says the reverse.
- With an unsaved photo, "Done" reads "Leave without saving".
- The picker is a labelled button ("Choose a photo" / "Choose a different
  photo") under one "Photo" heading. The same picker serves the Page-creation
  walkthrough, so it changes there too.

## How it was checked

Five new tests red against main's form and picker, green after. The real form
at 375×812 in the browser, before and after: before, Save was 596px below the
photo control with nothing pointing to it; after, the bar is in view from the
top of the page to the bottom, and the notice appears on upload.
