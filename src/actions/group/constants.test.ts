import { describe, it, expect } from 'vitest'
import { managingRoleForKind } from './constants'

// T132 — groups.md § Roles per kind: business Groups are managed by 'owner',
// every other kind by 'steward'. Single fix point for the role vocabulary
// divergence recorded in planning/stage-ledger/F060.md — used at group.create
// (the founder's role) and by group.update_draft (who may edit a draft).

describe('T132 — managingRoleForKind', () => {
  it('is owner for a business Group', () => {
    expect(managingRoleForKind('business')).toBe('owner')
  })

  it.each(['place', 'interest', 'practice', 'event_anchored', 'family'] as const)(
    'is steward for a %s Group',
    (kind) => {
      expect(managingRoleForKind(kind)).toBe('steward')
    },
  )
})
