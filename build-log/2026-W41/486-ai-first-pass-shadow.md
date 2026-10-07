### F100 (#486) — an AI reads every reported item first, in shadow

- **Trigger:** `report.create` schedules the read after the response (`after()`); the report path never waits and a failure leaves the report as F078 handles it. Unset `ANTHROPIC_API_KEY` means no read.
- **Reads:** Haiku 4.5 (text and vision) with a forced structured answer; confidence under 0.70 asks Sonnet 5.5 too; both are stored and the later is the one shown. Photos go as bytes, never as a URL, because a media URL carries its owner's id. Only the Page's words, the reporter's reason label and (later) the poster's reply are sent.
- **Never sent:** a sensitive-content report (suspected severity 1) gets one `skipped` row and no call or image fetch (criterion 12). The known-image hash check named there is not built yet, so those rows go to a person without a hash result. Builders' reports are skipped.
- **Shadow:** only `report_assessments` is written. Nothing hides, restores, notifies or reorders. Live mode (a data switch) is not built.
- **Agreement:** `report_ai_agreement` view (latest read vs latest decision), owner-only.
- **Harness:** `npm run moderation:eval` against `evals/moderation/cases.json` (11 text cases). Photo cases from licensed stock, and the criterion 11 gate, are still to do.
- Migration `20261007210000_report_assessments.sql`. Privacy draft must name Anthropic as a service provider receiving reported content (legal docs live outside this repo).
