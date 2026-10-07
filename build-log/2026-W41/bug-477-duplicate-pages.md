### bug #477 — the builders created every Page again each run

`/you` paints its Pages after the page itself ("Loading your Pages…"). The builder journey read the names as soon as the page was up, saw none, and `todaysNew` offered the first two of each kind (6 names) again. `readOwnPages` (`src/lib/builders/own-pages.ts`) now waits for the settled list and counts archived/deleted Pages as existing. Test seen failing without the wait. Existing copies are not deleted here: the proposal is in the PR.
