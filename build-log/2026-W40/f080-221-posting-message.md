### F080 (#221) — the safety line where a member posts

**Don, 2026-09-30:** no detection and no attestation. A message at posting states the rule, and reports (F078) are the backstop. That is F080 criterion 5. The copy is his placeholder ([public-is-draft]).

- **`src/lib/copy.ts`:** the first entry in a typed copy module, `COPY.postingSafety`. F084, which would move every string there, is still a draft; nothing else moved.
- **`PostingSafetyNote`** renders it:
  - on the publishing step of the new-Page walkthrough and the product, service and gathering composers, through a new `finalNotice` prop on `MultiStepComposer`;
  - above "Save changes" on a live Page's edit form, where its photo and words change;
  - above "Announce", only for someone who can announce.
- The announcement naming check scanned for "post" anywhere. It now skips the safety line, which uses "post" as a verb.

Tests: `src/components/posting-safety.test.tsx` (`[guards F080.5]`) and a `finalNotice` test in the composer suite. 8 seen failing with the component changes stashed, all passing with them. No migration.
