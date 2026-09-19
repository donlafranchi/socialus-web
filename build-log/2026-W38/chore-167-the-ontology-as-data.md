# The ontology as data

*2026-09-19. Three regexes read one TypeScript literal. Now one file exports it
and two of the three are gone.*

## What was wrong

`src/ontology/links.ts` was imported by exactly one test and parsed by three
regexes that never asked the compiler anything:

- `scripts/check-action-layer-conformance.ts` — Rule 5, the gate
- `scripts/ontology-drift.ts` — the daily report
- `ops-pattern scripts/state.sh` — in Python, over the GitHub API, rendering the
  ontology section of STATUS.md, with a `Could not parse the registry` fallback
  for the day the shape moved

Three readers, each free to disagree with the compiler and with each other, and
the failure mode is the one from this morning: **a regex that quietly matches
nothing reports no drift.** That is lesson 28 one layer up.

## registry.json

`scripts/ontology-registry.ts` imports the declarations and `listHandlers()` and
writes `src/ontology/registry.json`. Shape: `schema`, `objectTypes`, `links`,
`handlers`.

**Committed, not generated on demand**, because the reader that needs it most
cannot run anything here — ops-pattern reaches across with a read token and
`git show origin/main:<path>`. A script it cannot execute is no better than a
literal it cannot parse.

**Deterministic** — no timestamp, no commit sha. A field that changes on every
run would make the staleness check meaningless and the file pure diff noise.

**Kept honest by a test, not by discipline.** `tests/ontology-registry.test.ts`
regenerates it in memory and compares. A link added without regenerating is a
red PR, not a stale STATUS.md three days later.

## The parser that stays, and why it is now pinned

`check-action-layer-conformance.ts` keeps its regex: it reports the line number
of the offending declaration, which an import cannot give it. So the regex is
tested against the values it stands in for — its handler pattern must find
exactly `listHandlers()`, its link pattern exactly `LINK_TYPES`. If a rename or
a reformat makes it match nothing, that is now a failing test rather than a gate
that passes while checking nothing.

`ontology-drift.ts` needed no line numbers and now imports. Its SQL table scan
stays a regex — SQL has no importable form.

## Not a second description of the database

One test asserts it directly: every link's `via` has exactly `table` and
`column`, and every link exactly the eight fields `links.ts` declares. Nothing
about types, indexes or constraints can reach the output, because nothing puts
it in the input.

## For ops-pattern

Stable path `src/ontology/registry.json`, `schema: 1`. The Python parser in
`state.sh` and its could-not-parse branch both go — held until that repo is free.
