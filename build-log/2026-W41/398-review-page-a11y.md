# change #398 — review page accessibility fixes

From the code-level pass on #380 (findings in #398): single-key shortcuts only while focus is in the list (WCAG 2.1.4); the blurred photo toggles from a tap or the keyboard, with aria-pressed (2.1.1); focus moves to the next row after a decision (2.4.3); the shared Toast pauses while hovered or focused, so Undo waits for whoever is on it (2.2.1); the row in hand has aria-current and a focus ring (1.4.1). Four new tests, seen failing on the original. No layout change.
