// Generates src/ontology/registry.json — the ontology as data, for readers
// that are not this repo's compiler.
//
// WHY A GENERATED FILE AND NOT A FOURTH PARSER. `src/ontology/links.ts` was
// read by three independent regexes: the conformance check, the drift report,
// and — over the GitHub API, in Python — ops-pattern's `scripts/state.sh`,
// which renders STATUS.md's ontology section and carries a "could not parse
// the registry" branch for when the shape moves underneath it. Three parsers
// of one TypeScript literal, each free to disagree with the compiler and with
// each other. Lesson 28 is the same shape one layer up: reading an artefact's
// TEXT tests that someone wrote the words, not that the thing works.
//
// So this IMPORTS the declarations — the compiler's view, not a regex's — and
// writes them out once.
//
// COMMITTED, not built on demand, because the consumer that needs it most
// cannot run anything here: ops-pattern reads across repos with
// `git show origin/main:<path>` and a read token. A script it cannot execute
// is no better than the source it cannot parse.
//
// KEPT HONEST BY A TEST, not by discipline. tests/ontology-registry.test.ts
// regenerates this in memory and fails when the committed copy differs, so a
// link added without regenerating is a red PR rather than a stale STATUS.md.
//
// DETERMINISTIC ON PURPOSE — no timestamp, no commit sha. A field that changes
// on every run makes the staleness check meaningless and the file a source of
// diff noise.
//
// NOT A DESCRIPTION OF THE DATABASE, exactly as links.ts is not. Everything
// here comes from there; nothing is added. If a column type or an index ever
// appears in this output, it came from the declarations and belongs nowhere.

import { writeFileSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { LINK_TYPES, OBJECT_TYPE_NAMES } from '../src/ontology/links'
import { listHandlers } from '../src/actions'

const OUT = resolve(__dirname, '..', 'src', 'ontology', 'registry.json')

/** Bump when a consumer would have to change. ops-pattern reads this first. */
const SCHEMA = 1

export function buildRegistry(): string {
  return (
    JSON.stringify(
      {
        schema: SCHEMA,
        // Names only — the definitions live in ops-pattern's nouns.md, and an
        // object type declaring its fields here would be the migrations again.
        objectTypes: [...OBJECT_TYPE_NAMES],
        links: LINK_TYPES.map((l) => ({
          name: l.name,
          from: l.from,
          to: l.to,
          via: { table: l.via.table, column: l.via.column },
          writtenBy: [...l.writtenBy],
          ruled: l.ruled,
          built: l.built,
          note: l.note ?? null,
        })),
        // Verbs are never hand-listed. This is the registry in
        // src/actions/index.ts, read through its own accessor.
        handlers: listHandlers(),
      },
      null,
      2,
    ) + '\n'
  )
}

function main(): number {
  const next = buildRegistry()
  if (process.argv.includes('--check')) {
    let current: string
    try {
      current = readFileSync(OUT, 'utf8')
    } catch {
      console.error('src/ontology/registry.json is missing. Run: npm run ontology:registry')
      return 1
    }
    if (current !== next) {
      console.error('src/ontology/registry.json is stale. Run: npm run ontology:registry')
      return 1
    }
    return 0
  }
  writeFileSync(OUT, next, 'utf8')
  return 0
}

if (require.main === module) process.exit(main())
