import { describe, it, expect, vi, beforeEach } from 'vitest'

// T144 — group.activate gains the category write. Category is required at
// publish: a fixed-vocabulary term writes groups.category; "Something
// else" free text writes group_category_suggestions instead, leaving
// groups.category null. Neither given refuses activation outright — the
// same transaction never promotes a Page with no category.

type QueryCall = [string, unknown[]?]

const { query, appendEvent } = vi.hoisted(() => ({
  query: vi.fn(),
  appendEvent: vi.fn(async () => undefined),
}))

vi.mock('../_lib/db', () => ({
  withTransaction: vi.fn(async (fn: (client: { query: typeof query }) => unknown) =>
    fn({ query }),
  ),
}))
vi.mock('../_lib/event-log', () => ({ appendEvent }))

import { groupActivate } from './activate'
import type { ActionContext } from '../_lib/context'

const GROUP_ID = '11111111-1111-1111-1111-111111111111'
const FOUNDER_ID = '22222222-2222-2222-2222-222222222222'

function ctx(): ActionContext {
  return {
    actingMemberId: FOUNDER_ID,
    viaDelegationId: null,
    traceId: 'trace-1',
    db: {} as never,
    now: () => new Date('2026-09-08T00:00:00Z'),
  }
}

function callsMatching(pattern: RegExp): QueryCall[] {
  return (query.mock.calls as QueryCall[]).filter(([sql]) => pattern.test(sql))
}

// Routes by SQL shape rather than call order — this handler already ran
// several queries before T144 touched it; matching on shape is robust to
// reordering the pre-existing logic.
function installQueryRouter(opts: {
  kind?: string
  businessDisplayName?: string | null
  hasAnchor?: boolean
} = {}) {
  const kind = opts.kind ?? 'business'
  const hasAnchor = opts.hasAnchor ?? true
  const businessDisplayName = opts.businessDisplayName ?? 'Oak Park Sourdough'

  query.mockReset()
  query.mockImplementation(async (sql: string) => {
    if (/select id, kind, lifecycle_state, founder_member_id/i.test(sql)) {
      return {
        rows: [
          {
            id: GROUP_ID,
            kind,
            lifecycle_state: 'draft',
            founder_member_id: FOUNDER_ID,
            anchor_location_id: hasAnchor ? 'loc-1' : null,
            name: 'Real Name',
          },
        ],
      }
    }
    if (/select display_name\s+from public\.group_businesses/i.test(sql)) {
      return { rows: businessDisplayName ? [{ display_name: businessDisplayName }] : [] }
    }
    if (/update public\.groups\s+set lifecycle_state = 'active'/i.test(sql)) {
      return { rows: [{ id: GROUP_ID }] }
    }
    if (/update public\.groups\s+set category = \$1/i.test(sql)) {
      return { rows: [] }
    }
    if (/insert into public\.group_category_suggestions/i.test(sql)) {
      return { rows: [] }
    }
    throw new Error(`unexpected query in test: ${sql}`)
  })
}

beforeEach(() => {
  appendEvent.mockClear()
})

describe('group.activate — category required at publish', () => {
  it('refuses activation with neither a category term nor free text', async () => {
    installQueryRouter()
    await expect(groupActivate(ctx(), { groupId: GROUP_ID })).rejects.toThrow(/category/i)
    // Refused before promotion — no lifecycle_state write should have landed.
    expect(callsMatching(/set lifecycle_state = 'active'/i)).toHaveLength(0)
  })

  it('writes groups.category for a fixed-vocabulary term', async () => {
    installQueryRouter()
    await groupActivate(ctx(), {
      groupId: GROUP_ID,
      category: { term: 'Food & Drink' },
    })
    const [categoryCall] = callsMatching(/set category = \$1/i)
    expect(categoryCall).toBeDefined()
    expect(categoryCall![1]).toEqual(['Food & Drink', GROUP_ID])
    expect(callsMatching(/insert into public\.group_category_suggestions/i)).toHaveLength(0)
  })

  it('rejects a term outside the fixed vocabulary', async () => {
    installQueryRouter()
    await expect(
      groupActivate(ctx(), { groupId: GROUP_ID, category: { term: 'Not A Real Category' } }),
    ).rejects.toThrow()
  })

  it('writes group_category_suggestions for "Something else" free text, leaving groups.category untouched', async () => {
    installQueryRouter()
    await groupActivate(ctx(), {
      groupId: GROUP_ID,
      category: { otherText: 'I fix bicycles on weekends' },
    })
    const [suggestionCall] = callsMatching(/insert into public\.group_category_suggestions/i)
    expect(suggestionCall).toBeDefined()
    const [, params] = suggestionCall!
    expect(params).toContain(GROUP_ID)
    expect(params).toContain(FOUNDER_ID)
    expect(params).toContain('I fix bicycles on weekends')
    expect(params).toContain('i fix bicycles on weekends')
    expect(callsMatching(/set category = \$1/i)).toHaveLength(0)
  })

  it('normalizes whitespace-only free text to a refusal, same as no category at all', async () => {
    installQueryRouter()
    await expect(
      groupActivate(ctx(), { groupId: GROUP_ID, category: { otherText: '   ' } }),
    ).rejects.toThrow(/category/i)
  })
})
