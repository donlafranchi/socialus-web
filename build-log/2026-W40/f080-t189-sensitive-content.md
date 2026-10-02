### F080 · T189 (#221) — a "sensitive content" report hides at any bar and texts Don

Don, 2026-10-01: we can't enforce the sensitive-content rule, so we rely on reporting. "Children" widens to sensitive content and still hides at any bar.

- **Reasons** (F078 criteria 1 and 9): the report sheet asks "Why are you reporting this?", and Send waits for an answer. The choices are harassment, nudity, spam, violence, sensitive content (children, animals and pets, or anyone who can't fend for themselves), threat of harm, and something else. Labels are placeholders.
- **At any bar** (F078 criterion 8): sensitive content and threat of harm hide the Page photo past the per-member and open-report limits. The restore lock still holds, and so do the refusal caps against report-bombing.
- **Texts Don** (F078 criterion 5) after the commit, through Twilio. The text names the reason and links the queue, and never names the reporter or what they wrote. Builders' reports never text. Unset `TWILIO_*` / `OPERATOR_PHONE` means nothing is sent, with a warning in the log.
- **Queue:** shows the reason above what the reporter wrote.
- **Posting ask:** unchanged. `COPY.postingSafety` already covers children, pets and anyone who can't speak up for themselves.

Tests: handler, SMS sender, report sheet, server action and queue entry, each seen failing first. **Migration: `20261001120000_report_category.sql`.** Apply after #281.
