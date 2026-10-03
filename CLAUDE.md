# socialus-web — code repo

SocialUs: local discovery, buy/sell/trade/gather. Launching 2026-10-30 to one metro. Next.js App Router + TypeScript + Tailwind v4 + Supabase (Postgres/Auth/Realtime) + Mapbox GL JS, deployed on Vercel. Planning lives in the sibling repo `ops-pattern`; this repo is code.

## Naming

- **Issue title:** `F060 · T142 · plain name` for scenario work. `bug · plain name` / `change · plain name` / `chore · plain name` otherwise, with `Scenario: F###|none` in the body.
- **Branch:** the Issue number only, e.g. `318` (Don, 2026-10-02), so a migration applies with `gh workflow run apply.yml --ref 318 -f confirm=apply`. Branches opened before then keep their names. **Commit:** `F060/T142: what`. Bugs: `bug #nn: what`.
- **Provenance is git.** `git log --grep F060` is everything built for that scenario. No registers here.
- **Build log:** one new file per ticket, `build-log/YYYY-WNN/<ticket>-<slug>.md`. **Never append to a shared weekly file** — appending is what made every merge conflict every other open PR (chore #76; the reasoning is in `BUILD-LOG.md`).

## Before opening a ticket

Classify it by `ops-pattern/PIPELINE.md`'s five kinds first: scenario, change, bug, process, chore. Only a scenario carries acceptance checks. If a change or bug starts needing acceptance checks, it's actually a scenario — stop and ask `ops-pattern` for one before ticketing it as anything else.

## Who checks what

Agents own whether a change is **correct**. Don owns whether it is **right**. He does not read code, and nothing may ask him to — what he looks at is the running app on the Vercel preview link.

Every PR opens with one of two things, before anything else: **"Don doesn't need to look."** plus a reason, or **the preview link, three plain-language steps, and what he should expect to see** — then the `needs-don` label. `.github/pull_request_template.md` carries both blocks; keep one, delete the other.

That choice also decides the merge. **"Don doesn't need to look"** means merge it yourself once the checks are green — he is not proficient in code, so a review that spends his attention on code he cannot judge buys nothing, and waiting for one only parks finished work. **`needs-don`** means hold: say so, name what to look at on the preview, and he merges himself in GitHub or tells you to merge. Hold only for what he must judge — product wording, a UI he needs to see, a scope or role-model decision, anything with a real trade-off.

Steps are for someone holding a phone who has not read the ticket. No file paths, no function names, no ticket numbers. A change you cannot describe that way needs his eyes *more* — say so and label it anyway.

Full rule, including when he looks: `ops-pattern/PIPELINE.md` § Who checks what.

## The seeds are privileged

`supabase/seeds/` writes as `postgres`: RLS bypassed, two triggers disabled,
every UUID hard-coded, nothing through the action layer. A seeded row is
assembled by someone who already knew what the finished row should contain; a
real row is assembled by a handler from a form. **When they disagree, the seed
is the one that looks right**, and a surface can be correct against every
seeded row and broken for every member-created one with nothing going red.
That is how bug #175 — a Page a member created had no reachable URL — survived
weeks of people browsing working Page URLs in the seed data.

So: verify against a row that went through the handler. "It works on the seed"
is evidence about the seed. Full note, including why the seeds stay:
`supabase/seeds/README.md`.

## When a PR diverges from its scenario

A PR whose behavior differs from the cited scenario's Acceptance stops and asks for a scenario change first — in `ops-pattern`, not here. Don't quietly ship a different behavior than what was approved.

## Commits

Branch per ticket. **A merge to main deploys to production via Vercel** — so be sure the checks are green before you merge. Who merges, and when Don looks: § Who checks what, above. Never rewrite history. Never cross-commit with `ops-pattern`.

## Issue hygiene

`.github/ISSUE_TEMPLATE/work.md` and `.github/workflows/issue-lint.yml` enforce `Kind:`/`Scenario:` fields and flag scope drift automatically — label `needs-fix` means one of those checks failed; read the bot comment.

## Rulings that bind this repo

**ops-pattern `constraints/code.md`** — every ratified decision tagged as binding the
code tier, one line each, generated from `DECISIONS.md`. Read it before building;
it is the only rulings file this repo points at. Never edit it — change the tag on
the decision in ops-pattern. It lists only live rulings; superseded ones are gone.

**If two rulings seem to conflict, the newer wins and work continues** — never stop
to ask Don which is true (ops-pattern `[newer-decision-wins]`). Only two live
rulings in conflict with neither superseding the other are raised, as an
open-question marker where it bites. Never split the difference.

## Which check discharges which criterion

A test or script that discharges a scenario criterion says so on the line above it:
`// [guards F093.4]` — one criterion per marker, several markers on a line if one
check covers several. A check that covers only part of a criterion says what it
leaves out: `// [guards F093.4 partial: the call to sign in]`. A criterion counts as
covered only when one check claims all of it, since partial checks never add up.
ops-pattern builds a per-scenario coverage map from these, so a criterion with no
marked check shows as unguarded instead of assumed. Mark only
a check that has been seen failing against input it should reject
([guard-proves-itself]); a marker on a test that never ran is a false claim.

## Open questions

A question you cannot answer and will not answer this session is marked where it
lives: `[open-question owner=<don|cowork|code> raised=YYYY-MM-DD] the question`.
About one line of code or one migration → a comment on that line. About how to
build an Issue → the Issue **body** (comments are not scanned). Never a PR
description or commit message — neither can be edited to close it. A question
whose answer changes behaviour is not a marker; stop and ask for a scenario
change. Answering one removes the marker in the same commit. ops-pattern's
`STATUS.md` indexes every marker; `scripts/check-markers.sh` fails CI on
one missing an owner, a date or a question. Full rule:
`ops-pattern/process/PIPELINE.md` § Open questions.

## The ontology

The nouns live in ops-pattern `product/foundation/nouns.md`, the verbs in
`verbs.md`. **The links live in `src/ontology/links.ts`** — the relationships
between nouns, which had no home before and so lived implicitly in foreign keys.

**The rule: a ruling that introduces or changes a link updates that file in the
same PR.** Not afterwards, not in a follow-up ticket. Each entry carries its
`ruled:` date, which is the pointer back to the `DECISIONS.md` line.

It is code, not a document, on purpose — ops-pattern's `CLAUDE.md` § Naming rules
that a file only a script compares is fine, because nothing believes it, and a
document called REGISTRY died in this project once already.
`scripts/check-action-layer-conformance.ts` Rule 5 fails the PR when a link
claims a handler that is not registered, or points at a table no migration
creates. It runs at `npm test`. A link also carries the ruling behind it or it
does not go in — a bare note that restates the foreign key fails there too.

**`src/ontology/registry.json` is the same thing as data**, generated from those
declarations by `npm run ontology:registry` and committed, because ops-pattern's
STATUS.md job reads it across repos with `git show` and cannot run a script here.
Change a link, regenerate, commit both — a test compares them and goes red
otherwise. Nothing is written into the JSON by hand.

**It declares meaning, not columns.** `via` names a table and column only so the
check has something real to compare against. If you are adding a type or an
index there, it has drifted into being a second copy of the migrations.

**Verbs are never hand-listed** — they are read from `src/actions/index.ts`.

**The object types live in `src/ontology/objects.ts`** and are pointers: a name,
a status in `nouns.md`'s own four-state vocabulary, and where that file defines
it. Nothing else — no fields, no columns, no tables. The deferral that stood here
was retired on 2026-09-19 after firing zero times in two chances; a status is
checked rather than asserted, so a noun declared live with no built link relating
it fails the build.

**A role is not a noun.** Creator, organizer, follower and patron name a person's
relation to a Page, not a kind of person — `nouns.md` says a Member has "no type,
tier, or stored role", and these belong on the links. Authority is its own link
(`group_memberships.role`, what every managing check reads) and is deliberately
not the founder link (`groups.founder_member_id`, who started it).
