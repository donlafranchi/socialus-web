# F065.5 · #605: the following list has one reader

The PM, 2026-10-11, option B: keep the three tables, no schema change. The scenario wording is already amended in `socialus-plan` (F065 criterion 5: "the following list has one reader"). Code: a guard, `src/lib/follows/one-reader.test.ts`, that `/you/following` and the `/you` summary read the list only through `getMemberFollows` and query none of the three tables themselves.
