// chore #428 — the review bundle captures only the screens a diff can change.
// changedRoutes() maps changed files to screen routes (evals/screens/routes.ts)
// and the personas worth looking at them as.

import { describe, it, expect } from 'vitest'
import { ROUTES } from '../evals/screens/routes'
import { PERSONAS } from '../evals/personas'
import { changedRoutes, ROUTE_MAP } from '../scripts/changed-routes'

const names = new Set(ROUTES.map((r) => r.name))

describe('changedRoutes', () => {
  it('maps only to routes that exist', () => {
    for (const [, routes] of ROUTE_MAP) for (const r of routes) expect(names.has(r), r).toBe(true)
  })

  it('maps an edit-card change to the edit screen, as the people who can see it', () => {
    const r = changedRoutes(['src/components/group/edit/PageEditor.tsx'])
    expect(r.routes).toEqual(['page-edit'])
    expect(r.personas).toContain('ownerBusiness')
    expect(r.personas).toContain('signedOut')
    expect(r.personas).not.toContain('follower')
  })

  it('maps a Page component change to every Page view, as every persona', () => {
    const r = changedRoutes(['src/components/group/PagePosts.tsx'])
    expect(r.routes).toEqual(expect.arrayContaining(['page', 'page-business', 'page-private']))
    expect(r.personas).toEqual(PERSONAS.map((p) => p.key))
  })

  it('maps an app route to its screens', () => {
    expect(changedRoutes(['src/app/explore/page.tsx']).routes).toEqual(expect.arrayContaining(['explore', 'explore-map']))
    expect(changedRoutes(['src/app/you/page.tsx']).routes).toContain('you')
  })

  it('maps a database or action change to the common read screens', () => {
    for (const f of ['supabase/migrations/20261007000000_x.sql', 'src/actions/group/lifecycle.ts']) {
      expect(changedRoutes([f]).routes).toEqual(expect.arrayContaining(['page', 'page-private', 'explore', 'you']))
    }
  })

  it('falls back to the smoke slice for a runtime change it cannot place', () => {
    const r = changedRoutes(['src/lib/some-helper.ts'])
    expect(r.routes).toEqual([])
    expect(r.fallback).toBe('smoke')
  })

  it('ignores tests, docs and workflows', () => {
    const r = changedRoutes(['src/components/group/PagePosts.test.tsx', 'docs/x.md', '.github/workflows/ci.yml'])
    expect(r.routes).toEqual([])
    expect(r.fallback).toBeUndefined()
  })

  it('unions the routes of several files, once each', () => {
    const r = changedRoutes(['src/components/group/edit/PageEditor.tsx', 'src/app/g/[handle]/edit/page.tsx'])
    expect(r.routes.filter((x) => x === 'page-edit')).toHaveLength(1)
  })
})
