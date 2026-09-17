# The link types — the relationships get a home

*2026-09-17. Narrowed scope: links only. Object types deferred, verbs derived.*

## The gap, stated precisely

It is not true that we weren't capturing the ontology. `nouns.md` and `verbs.md`
both exist in ops-pattern, both carry a shared status vocabulary, and nouns.md
says outright that it is one of two tracking documents.

**What had no home anywhere were the links** — the relationships between nouns.
They lived implicitly in foreign keys, which meant every question about them was
answered by reading migrations, and the same facts kept being rediscovered. The
case that forced it: *a Member supporting a Page* and *a Member subscribed to a
Page's updates* are two different links between the same two nouns, and when Don
ruled on that distinction there was nowhere to write it down.

## Why code and not a document

ops-pattern's `process/LIVING-DOCS.md` already settled this: **"a file only a
script compares is safe, because nothing believes it."** A document called
REGISTRY died in this project once, along with MAP, TRACE, STAGE-LEDGER and
JOURNAL, for exactly the reason that people read them to be right.

So `src/ontology/links.ts` is imported by a check that runs at `npm test`. A
wrong entry is a build failure, not a lie waiting to be read.

**It lives in socialus-web, not ops-pattern**, because code imports it and a
script compares it — it has to be where the code is. ops-pattern rulings change
its *content*, and each entry's `ruled:` date is the pointer back to the
`DECISIONS.md` line that put it there. That keeps the one-place rule: the
ruling lives in DECISIONS, the relationship lives here, neither restates the
other.

## Six links, and the line held

| Link | Backing | Built |
|---|---|---|
| a Member owns a Page | `groups.founder_member_id` | ● |
| a Member authored an Item | `items.member_id` | ● |
| an Item is filed under a Page | `items.group_id` | ● |
| an Item is at a Location | `item_locations.location_id` | ● |
| a Member is subscribed to a Page's updates | `group_memberships.relationship` | ● |
| a Member supports a Page | *none yet* | ○ unbuilt |

**It declares meaning, not columns.** `via` names a table and column only so the
check has something real to compare against. Anything that looks like a type, an
index or a constraint has drifted into being a second copy of the migrations.

**Not declared, on purpose:** the events tables, unused substrate (delegations,
messages), retired vendor surfaces, PostGIS internals, and anything keyed to
`groups.kind` — the Page kinds question is unruled and declaring links over a
vocabulary Don is actively changing would buy a rename.

## The check, and what it deliberately does not check

One new check inside `scripts/check-action-layer-conformance.ts` — the file that
already holds three, already has `--json`, already has an exemptions ledger, and
already reaches CI through the enforcement tests. Not a new script, not a new
workflow, not a new eslint rule.

- **5a** — every handler a link claims writes it exists in the action registry
- **5b** — every table a link points at exists in the migrations

Code against code, never a doc against a doc.

**It does NOT fail on a handler that no link declares.** Most handlers create no
relationship, and deciding which ones should is judgement a script cannot do. A
gate that fires on judgement gets ignored, and then the gate that fires on
certainty gets ignored with it.

That list is still worth seeing, so it goes in the daily report instead.

## The daily report

`scripts/ontology-drift.ts` prints two lists — declarations whose handler or
table has gone, and handlers no link declares — and **is silent and green when
clean**. A green every morning is indistinguishable from a job that did not run,
which is part of why the existing daily check reads as unreliable.

It rides the **existing** daily job (`deploy-health.yml`) rather than taking a
schedule of its own. `LIVING-DOCS.md` refuses scheduled Actions on the grounds
that a thing regenerating on a schedule rots between reads, and a second cron is
a second thing to notice firing late. This one only speaks when something is
wrong, which is what turns the workflow red and reaches Don.

## The instruction

`CLAUDE.md` § The ontology, where agents already read: **a ruling that
introduces or changes a link updates `src/ontology/links.ts` in the same PR.**
Not afterwards, not in a follow-up ticket.

Verbs are never hand-listed — they are read from `src/actions/index.ts`. Object
types are deferred: a noun gets a declaration the next time a handler touching
it is edited.

## First, though: the existing gate was red

`ops-pattern scripts/lint.sh` failed on `main` with 24 findings — 12 scenarios
with sections outside the allowed three, 7 planning notes missing `status:`, 5
scenarios over the 40-line cap. Adding a new gate to a pipeline whose existing
gate is already red teaches everyone that gates are advisory.

Fixed before this landed (ops-pattern `8ae6c48`), and not by deleting content:
the 12 offending sections were all *rationale* — "why this shape", "what was
rejected", "how it relates to F081" — under a dozen ad-hoc headings. They now
fold under one `## Why`, which is allowed and **excluded from the 40-line cap**,
because the cap exists to keep a spec small enough to hold in your head and
rationale is not spec. `process/PIPELINE.md` updated to match. Lint is clean.

## Checks

`tsc` clean · Rule 5 proven to fail both ways and pass when correct · 8 new
tests, including the two negative cases — a check that only ever passes is
indistinguishable from a check that does nothing.
