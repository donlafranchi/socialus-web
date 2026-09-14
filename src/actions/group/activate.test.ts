import { describe, it, expect, vi, beforeEach } from 'vitest'

// T159 — group.activate writes tags, not a category. At least one tag is
// required at publish: tags are what search matches, and an untagged Page
// cannot be found by what it does. Supersedes T144's twelve-term category
// and its "Something else" free text, both retired 2026-09-13.

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
    if (/insert into public\.tags/i.test(sql)) {
      return { rows: [] }
    }
    if (/insert into public\.page_tags/i.test(sql)) {
      return { rows: [] }
    }
    throw new Error(`unexpected query in test: ${sql}`)
  })
}

beforeEach(() => {
  appendEvent.mockClear()
})

describe('group.activate — at least one tag is required at publish', () => {
  it('refuses activation with no tags at all', async () => {
    installQueryRouter()
    await expect(groupActivate(ctx(), { groupId: GROUP_ID })).rejects.toThrow(/tag/i)
    // Refused before promotion — no lifecycle_state write should have landed.
    expect(callsMatching(/set lifecycle_state = 'active'/i)).toHaveLength(0)
  })

  it('refuses activation when every tag is whitespace', async () => {
    installQueryRouter()
    await expect(
      groupActivate(ctx(), { groupId: GROUP_ID, tags: ['   ', '\t'] }),
    ).rejects.toThrow(/tag/i)
    expect(callsMatching(/set lifecycle_state = 'active'/i)).toHaveLength(0)
  })

  it('creates the tag and attaches it to the Page', async () => {
    installQueryRouter()
    await groupActivate(ctx(), { groupId: GROUP_ID, tags: ['Sourdough'] })

    const [tagCall] = callsMatching(/insert into public\.tags/i)
    expect(tagCall).toBeDefined()
    // Label preserved as typed; normalized form is the uniqueness key.
    expect(tagCall![1]).toEqual(['Sourdough', 'sourdough', FOUNDER_ID])

    const [attachCall] = callsMatching(/insert into public\.page_tags/i)
    expect(attachCall).toBeDefined()
    expect(attachCall![1]).toEqual([GROUP_ID, 'sourdough'])
  })

  it('attaches a tag another creator already made, rather than failing on the conflict', async () => {
    // The insert returns no row when the tag exists, which is why the attach
    // selects by normalized form instead of relying on `returning`.
    installQueryRouter()
    await groupActivate(ctx(), { groupId: GROUP_ID, tags: ['sourdough'] })
    expect(callsMatching(/insert into public\.tags/i)[0]![0]).toMatch(/on conflict \(normalized\) do nothing/i)
    expect(callsMatching(/insert into public\.page_tags/i)).toHaveLength(1)
  })

  it('writes one tag when the same word is sent twice in different shapes', async () => {
    installQueryRouter()
    await groupActivate(ctx(), {
      groupId: GROUP_ID,
      tags: ['Sourdough', ' sour dough ', 'SOURDOUGH'],
    })
    const normalized = callsMatching(/insert into public\.tags/i).map((c) => c[1]![1])
    expect(normalized).toEqual(['sourdough', 'sour dough'])
  })

  it('writes every distinct tag', async () => {
    installQueryRouter()
    await groupActivate(ctx(), { groupId: GROUP_ID, tags: ['bread', 'pastry', 'cake'] })
    expect(callsMatching(/insert into public\.page_tags/i)).toHaveLength(3)
  })

  it('drops an over-long tag rather than truncating it', async () => {
    installQueryRouter()
    await expect(
      groupActivate(ctx(), { groupId: GROUP_ID, tags: ['a'.repeat(41)] }),
    ).rejects.toThrow()
  })

  it('never writes a category or a suggestion — both are retired', async () => {
    installQueryRouter()
    await groupActivate(ctx(), { groupId: GROUP_ID, tags: ['sourdough'] })
    expect(callsMatching(/set category = /i)).toHaveLength(0)
    expect(callsMatching(/group_category_suggestions/i)).toHaveLength(0)
  })
})

