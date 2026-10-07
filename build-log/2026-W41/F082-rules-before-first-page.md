### F082 · #223 — the rules, agreed before every Publish

Publishing a Page now takes the member's agreement to the current rules: `group.activate` refuses without `rulesVersion` equal to `RULES_VERSION` and records (member, Page, version, time) in `creator_rules_agreements` in the same transaction. Drafts never ask. Table has RLS on and no client policy or grant (read server-side only, criterion 6). The Publish card shows the rules with reasons, an "I agree to these rules" box, and a link to `/rules`; `/rules` is also in the footer (criterion 7). Rule text in `src/lib/creator-rules.ts` is draft copy for the PM, with the no-pictures-of-children rule (criterion 9) verbatim; editing it and bumping `RULES_VERSION` re-asks every owner.

Not done: the retired sell walkthrough's `sellActivateAction` passes no version and would be refused if revived. The footer is desktop-only (existing #296 rule), so on a phone the rules are one tap from the Publish card only.
