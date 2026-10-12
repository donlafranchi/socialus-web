# F078/F102 · #626 #627 #703: courtesy notice first, one mistake button, report-path copy

The first ordinary report no longer hides: it leaves the owner a courtesy notice (`member_notices.kind = 'courtesy'`) and the post stays up. A report from a second member hides it and queues it for staff. Threat of harm and Sensitive content hide at once, as before; Sensitive content still tells the poster nothing.

- The owner has one button, "This is a mistake" (answer kind `mistake`, no reason, no note). A claim sorts that item to the top of the review list, and blocks the AI auto-restore like the old "wrong" answer.
- A first report that only sent a courtesy notice is left out of the staff queue until the item hides or is decided, so first reports add no staff work.
- Report-path copy from the PM's calls on #627 is applied on top of draft #678. The report sheet, sent line, owner notice and answer line are in `src/lib/copy.ts`, `notices.ts`, `YouNotices.tsx`.
- Bugs #702 and #704 (autofocus, signed-out prompt) shipped in #705. #703: `sendReportAction` now returns plain words instead of throwing the developer string.

Migration: `20261012010000_courtesy_notice_and_mistake_claim.sql` widens two CHECK constraints.

Unsettled, in the PR body: the same member reporting twice is not a "second report"; a repeat reporter's second report on an item hidden by someone else is unaffected.
