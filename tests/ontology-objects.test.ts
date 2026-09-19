// The object types — pointers, and the checks that stop them becoming a
// second description of the database.
//
// They were deferred from 2026-09-17 on the rule "a noun gets a declaration the
// next time a handler touching it is edited." Handlers touching Page were edited
// twice and nothing was declared, because there was no shape a declaration could
// take. Ruled 2026-09-19: build them pointer-style. A rule with no hook is a
// wish — lesson 17 — so these are the hook.

import { describe, it, expect } from 'vitest'
import {
  OBJECT_TYPES,
  OBJECT_TYPE_NAMES,
  REJECTED_AS_NOUNS,
  type ObjectTypeStatus,
} from '../src/ontology/objects'
import { LINK_TYPES } from '../src/ontology/links'

const STATUSES: ObjectTypeStatus[] = ['live', 'substrate', 'postponed', 'refused']

describe('every noun is declared once, and only as a pointer', () => {
  it('each name has exactly one declaration', () => {
    for (const n of OBJECT_TYPE_NAMES) {
      expect(OBJECT_TYPES.filter((o) => o.name === n)).toHaveLength(1)
    }
    expect(OBJECT_TYPES).toHaveLength(OBJECT_TYPE_NAMES.length)
  })

  it("uses nouns.md's own four-state vocabulary, not a new one", () => {
    for (const o of OBJECT_TYPES) expect(STATUSES).toContain(o.status)
  })

  it('points at where the noun is defined rather than defining it', () => {
    for (const o of OBJECT_TYPES) expect(o.definedIn).toMatch(/^nouns\.md §/)
  })

  // THE LINE. An object type carries a name, a status, a pointer and a note.
  // A field list, a column, a table or a type here is the migrations written
  // twice, and the second copy is the one that goes wrong quietly.
  it('carries no schema detail at all', () => {
    for (const o of OBJECT_TYPES) {
      expect(Object.keys(o).sort()).toEqual(['definedIn', 'name', 'note', 'status'].sort())
    }
  })
})

describe('a status is checked, not asserted', () => {
  // Without this the declarations are a document, and a document that says a
  // noun is live while nothing relates it is exactly the failure this whole
  // file exists to avoid.
  it('a live noun is related by at least one built link', () => {
    const relatedByBuilt = new Set(LINK_TYPES.filter((l) => l.built).flatMap((l) => [l.from, l.to]))
    for (const o of OBJECT_TYPES) {
      if (o.status === 'live') {
        expect(relatedByBuilt.has(o.name), `${o.name} is declared live and no built link relates it`).toBe(true)
      }
    }
  })

  it('a noun that no link relates at all is not declared live', () => {
    const related = new Set(LINK_TYPES.flatMap((l) => [l.from, l.to]))
    for (const o of OBJECT_TYPES) {
      if (!related.has(o.name)) expect(o.status).not.toBe('live')
    }
  })
})

describe('a relation to a Page is not a kind of person', () => {
  // Don, 2026-09-19: "Person" is rejected as a noun, and creator, organizer,
  // follower and patron are relations rather than object types. nouns.md says
  // the same thing from the other side — a Member has "no type, tier, or
  // stored role". Adding one of these here turns a relation into an identity.
  it('no rejected word is an object type', () => {
    const names = new Set<string>(OBJECT_TYPE_NAMES)
    for (const w of REJECTED_AS_NOUNS) {
      expect(names.has(w), `${w} is a relation to a Page, not a noun`).toBe(false)
    }
  })

  it('the authority relation is a link, and a different one from founding', () => {
    // Creator/organizer is the exception Don called out: authority, not
    // attachment. It must not collapse into the founder link.
    const runs = LINK_TYPES.find((l) => l.name === 'a Member runs a Page')
    const owns = LINK_TYPES.find((l) => l.name === 'a Member owns a Page')
    expect(runs, 'the authority link is missing').toBeDefined()
    expect(owns).toBeDefined()
    expect(runs!.via.table).toBe('group_memberships')
    expect(runs!.via.column).toBe('role')
    // Different columns, because they are different facts. If these ever point
    // at the same place, authority and founding have been flattened again.
    expect(`${runs!.via.table}.${runs!.via.column}`).not.toBe(`${owns!.via.table}.${owns!.via.column}`)
  })
})
