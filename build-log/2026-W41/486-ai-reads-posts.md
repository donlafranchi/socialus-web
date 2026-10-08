### F100 / F101 / F078 — what was left after the first six PRs

Checked #220, #486, #487, #488 against their criteria; this closes the gaps that can be built now.

- **F100 criterion 1:** the AI now reads every kind of reported thing: a Page's photo, its picture, a Post's words, and a post's photo (with the post's words beside it). A poster's answer is read too: the reply (reason and note) goes with the content as the poster's side, in shadow.
- **F100 criterion 8 / F101 criterion 3:** the AI's mode is data (`moderation_settings.ai_mode`, `shadow` or `live`). Flip it with `update public.moderation_settings set ai_mode = 'live'`. In live mode a row's severity is the higher of the reporter's and the AI's; remove, restore and strikes stay a person's tap.
- **F101 criterion 2:** each row shows "AI: remove · 0.91 · AI severity 2 — reason", or that the AI did not read it (suspected severity 1). The report detail shows the same.
- **F101 criterion 10:** the one-tap Remove records the reason that matches the row's top category (harassment, threat of harm, violence, nudity, sensitive content, spam), a tie going to the more serious. `report_decisions.reason_code` gains those codes.
- **F101 criterion 15:** a test shows 50 rows clear with one keystroke each. The 375px browser timing is not measured.
- **F078 criterion 10:** the report sheet tells the reporter, before Send, what misuse costs. Placeholder copy.
- Migration `20261007300000_ai_mode_and_reasons.sql`.

**Still open, on purpose:** F100 criteria 10–12 (the photo test set from licensed stock, the live-mode gate numbers, the known-image hash check for severity 1: none exist yet); F102 criterion 12 (severity-4 auto-restore, which needs the gate to be cleared); F101 criterion 12's full history in the detail shows decisions, the answer and the AI read, but not every earlier AI read.
