import { describe, it, expect } from 'vitest'
import { PAGE_PURPOSES } from './purposes'
import { PURPOSES, TYPE_FOR_PURPOSE } from '../lib/groups/page-kind'
import { OBJECT_TYPE_NAMES, REJECTED_AS_NOUNS } from './objects'

describe('#363 — Page purposes are declared, and match the code', () => {
  it('declares exactly the purposes the code stores', () => {
    expect(PAGE_PURPOSES.map((p) => p.value).sort()).toEqual([...PURPOSES].sort())
  })
  it('each serves at least one journey loop', () => {
    for (const p of PAGE_PURPOSES) expect(p.loops.length, p.value).toBeGreaterThan(0)
  })
  it('the default type each declares is the one the code applies', () => {
    for (const p of PAGE_PURPOSES) expect(TYPE_FOR_PURPOSE[p.value], p.value).toBe(p.defaultType)
  })
  it('a purpose is not a noun, and members still have no type', () => {
    expect(OBJECT_TYPE_NAMES as readonly string[]).not.toContain('Purpose')
    expect(REJECTED_AS_NOUNS as readonly string[]).toEqual(expect.arrayContaining(['Creator']))
  })
})
