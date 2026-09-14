### T149 (#30) — Retire the vendor routes: gated, one carve-out taken

**The ticket cannot run as written, and the reason is in the tree.** T149 says delete `/register-vendor`, redirect `/vendors/[slug]` and `/business/[slug]`, and lists `Depends on: nothing`. Two open, approved tickets say otherwise:

- **T125 (#15):** *"Do not delete the vendor-era files, and specifically do not delete `RecruitmentGrid.tsx`, `VendorCard.tsx`, `/vendors/[slug]`, or `/you/vendor` — they are T125's and T126's reference material."* Also: *"The app builds with every vendor-era file still on disk. No deletions in this ticket."*
- **T126 (#16):** *"Read `src/app/register-vendor/page.tsx` … and `src/app/you/vendor/page.tsx` … before writing this — both are on disk and must not be deleted first."*
- **The ruling behind both** (`audit-vendor-prior-art.md` § 6, on the PM's instruction): *"Do not delete anything until T125 and T126 have merged."*

So T149's real dependency is T125 + T126, and its `Depends on: nothing` is wrong. Escalated on the Issue rather than improvised around.

**The one carve-out that ruling names is taken here:** *"`/following` gets its redirect now — it is a live, routable duplicate of a shipped surface, and a redirect deletes nothing."* `/following` now 307s to `/you/following`. The stale page file stays on disk with the rest of the gated set; a `next.config` redirect shadows a page at the same path, so the address answers with the real surface without deleting anything.

**Three of the issue's premises are wrong and are corrected on it:** `/business/[slug]` already redirects (it has since before this ticket, so its page file is unreachable, not "fully routable"); the four components said to point at `/vendors/[slug]` are unreachable at runtime, three of them via `HomeFeed.tsx`, which no module imports; and `web-t133/` is not on disk while `scripts/migration-conformance.sh` — the check T149 asks to extend — does not exist in this repo at all.

**`permanent: false`, deliberately.** Nothing is published (STATUS 2026-09-08), so no `/following` link exists outside the repo to be protected by a 308, and a 308 is cached in browsers indefinitely. Matches the four redirects already in the file.

**Both new guards are proven to fail**, not just to pass: pointing a destination at a nonexistent route reddens the run, and so does writing a redirect in a shape the parser cannot read — the parser-completeness test exists because a silently-skipped redirect would make the dangling-destination check pass without checking anything.

Verified: `unit tests only`, plus one manual check against `next start` — `/following` → 307 → `/you/following` → 307 → `/auth/login?next=/you/following`. Tests: 3 new. Full suite: the same pre-existing reds as main (the `ci-enforcement-rule-*` / `eval-bootstrap` subprocess flake and the known signup red, #38) — no new regressions. tsc/eslint unchanged from baseline (3 tsc errors, 45 lint problems, all pre-existing).
