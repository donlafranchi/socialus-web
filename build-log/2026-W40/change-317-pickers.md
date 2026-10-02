### change #317 — date and time pickers that are easy to use

Don, 2026-10-02: "The date and time pickers are very very ugly and difficult to use."

**Before:** native date and time inputs with hidden labels, side by side, empty, with the browser's mm/dd/yyyy and --:-- showing, plus a bare "until" input.

**Now (the post composer and the post edit form):**
- Still optional; undated stays first-class. **Add a date and time** fills today, the next whole hour and an end one hour later, all in the metro's clock.
- The end follows the start until the owner sets it.
- Visible labels (Date, Starts, Ends). Full width and 44px tall, three across from 640. The phone's own pickers on iOS and Android.
- A past date can't be picked (`min` today). **No particular time** clears it all.
- **Not here:** the gathering form. It sits with the old create-flow files under the stop note, and moves with the event-form template (#302).

Tests: the new picker tests were seen failing first. The composer's tests now ask for a time first, and one expects the default end to be cleared to send none. No migration.
