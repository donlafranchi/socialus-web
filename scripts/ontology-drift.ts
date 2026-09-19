// The daily ontology drift report.
//
// NOT a second conformance check. `check-action-layer-conformance.ts` Rule 5
// is the GATE: it fails a PR on things that are certainly wrong — a link
// claiming a handler that is not registered, or a table no migration creates.
// This is the REPORT: it surfaces the judgement calls a gate must not make,
// because a gate that fires on judgement gets ignored and then the gate that
// fires on certainty gets ignored with it.
//
// Two lists, and nothing else:
//   1. handlers in the registry that no link declares
//   2. declarations whose handler or table is gone
//
// SILENT WHEN CLEAN, deliberately. The daily job that already exists reads as
// unreliable partly because a green every morning is indistinguishable from a
// job that did not run. This prints nothing and exits 0 when there is no drift;
// when there IS drift it prints the lists and exits 1, which is what turns the
// workflow red and reaches Don.
//
// List 1 is EXPECTED to be non-empty today: most handlers do not create a
// relationship, and object types are deliberately deferred. It is reported as
// information, never as a failure on its own.

import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { LINK_TYPES } from '../src/ontology/links'
import { listHandlers } from '../src/actions'

const ROOT = resolve(__dirname, '..')

// IMPORTED, not parsed. This script used to regex `src/actions/index.ts` and
// `src/ontology/links.ts` for the same facts they already export. That made it
// the second of three parsers of one literal, each able to disagree with the
// compiler — and a parser that quietly matches nothing reports "no drift",
// which is the failure this job exists to catch. See lesson 28.
function registeredHandlers(): string[] {
  return listHandlers().sort()
}

function migrationTables(): Set<string> {
  const dir = resolve(ROOT, 'supabase/migrations')
  const names = new Set<string>()
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.sql'))) {
    const sql = readFileSync(resolve(dir, f), 'utf8')
    for (const m of sql.matchAll(
      /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-z0-9_]+)/gi,
    )) {
      names.add(m[1].toLowerCase())
    }
  }
  return names
}

interface Declared {
  name: string
  table: string
  writtenBy: string[]
  built: boolean
}

function declaredLinks(): Declared[] {
  return LINK_TYPES.map((l) => ({
    name: l.name,
    table: l.via.table,
    writtenBy: [...l.writtenBy],
    built: l.built,
  }))
}

function main(): number {
  const handlers = registeredHandlers()
  const tables = migrationTables()
  const links = declaredLinks()
  const claimed = new Set(links.flatMap((l) => l.writtenBy))

  const undeclared = handlers.filter((h) => !claimed.has(h))
  const broken: string[] = []
  for (const l of links) {
    for (const w of l.writtenBy) {
      if (!handlers.includes(w)) broken.push(`"${l.name}" — handler '${w}' is not registered`)
    }
    if (!tables.has(l.table)) broken.push(`"${l.name}" — table '${l.table}' has no migration`)
  }

  // Only a broken declaration is drift. An undeclared handler is information.
  if (broken.length === 0) return 0

  console.error('Ontology drift\n')
  console.error(`Declarations whose handler or table is gone (${broken.length}):`)
  for (const b of broken) console.error(`  - ${b}`)
  console.error(`\nHandlers no link declares (${undeclared.length}, informational):`)
  for (const h of undeclared) console.error(`  - ${h}`)
  console.error(
    '\nA ruling that introduces or changes a link updates src/ontology/links.ts in the same PR.',
  )
  return 1
}

process.exit(main())
