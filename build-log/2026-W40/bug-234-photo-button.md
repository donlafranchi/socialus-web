### bug #234 — The Page photo control is a button

**Don could not see where to add a photo.** `PagePhotoPicker` rendered the browser's bare file input: no button shape, no pointer, no focus ring. The same component is the photo step in the sell walkthrough, so one fix covers both the edit screen and a new Page's draft.

**Now a real `<button>`** — `btn-secondary`, `cursor-pointer`, a `focus-visible` ring (the shared button classes set `outline: none`, so the ring has to be explicit), reading "Choose a photo" or "Change photo". It clicks a hidden input (`sr-only`, `tabindex=-1`, `aria-hidden`) so there is one thing to reach, not two. Choosing still only uploads; the Page changes when the owner saves.

Tests: 4 new in `PagePhotoPicker.test.tsx` (role and name, classes, opens the chooser, input out of tab order), each seen failing first. **No migration.**
