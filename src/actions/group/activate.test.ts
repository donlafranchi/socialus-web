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
import { RULES_VERSION } from '../../lib/creator-rules'
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
  description?: string
  name?: string
  savedTags?: number
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
            name: opts.name ?? 'Real Name',
            description: opts.description ?? 'Bread, daily.',
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
    if (/from public\.page_tags/i.test(sql) && /count/i.test(sql)) {
      return { rows: [{ n: opts.savedTags ?? 1 }] }
    }
    if (/insert into public\.creator_rules_agreements/i.test(sql)) {
      return { rows: [] }
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

// #301 (2026-10-01): publishing needs a name, where it is (an address or an
// area), a description and at least one tag ("Tags are set on the draft Page
// and still required to publish", DECISIONS 2026-10-01; F082.8).
describe('group.activate — what publishing needs', () => {
  it('publishes with the tags already saved on the draft', async () => {
    installQueryRouter({ savedTags: 2 })
    await groupActivate(ctx(), { groupId: GROUP_ID, rulesVersion: RULES_VERSION })
    expect(callsMatching(/set lifecycle_state = 'active'/i)).toHaveLength(1)
  })

  it('refuses a Page with no tags, saved or given, for every kind', async () => {
    for (const kind of ['business', 'group']) {
      installQueryRouter({ kind, savedTags: 0 })
      await expect(groupActivate(ctx(), { groupId: GROUP_ID, rulesVersion: RULES_VERSION })).rejects.toThrow(/tag/i)
      expect(callsMatching(/set lifecycle_state = 'active'/i)).toHaveLength(0)
    }
  })

  it('a tag given at publish counts', async () => {
    installQueryRouter({ savedTags: 0 })
    await groupActivate(ctx(), { groupId: GROUP_ID, rulesVersion: RULES_VERSION, tags: ['sourdough'] })
    expect(callsMatching(/set lifecycle_state = 'active'/i)).toHaveLength(1)
  })

  it('refuses a Page with no description, for every kind', async () => {
    for (const kind of ['business', 'group']) {
      installQueryRouter({ kind, description: '   ' })
      await expect(groupActivate(ctx(), { groupId: GROUP_ID, rulesVersion: RULES_VERSION })).rejects.toThrow(/description/i)
      expect(callsMatching(/set lifecycle_state = 'active'/i)).toHaveLength(0)
    }
  })

  it('refuses a Page with no location, for every kind', async () => {
    for (const kind of ['business', 'group']) {
      installQueryRouter({ kind, hasAnchor: false })
      await expect(groupActivate(ctx(), { groupId: GROUP_ID, rulesVersion: RULES_VERSION })).rejects.toThrow(/anchor|where/i)
      expect(callsMatching(/set lifecycle_state = 'active'/i)).toHaveLength(0)
    }
  })

  it('refuses a Page still carrying the placeholder name', async () => {
    const { DRAFT_NAME_PLACEHOLDER } = await import('./constants')
    installQueryRouter({ kind: 'group', name: DRAFT_NAME_PLACEHOLDER })
    await expect(groupActivate(ctx(), { groupId: GROUP_ID, rulesVersion: RULES_VERSION })).rejects.toThrow()
  })
})

describe('group.activate — tags, when given', () => {
  it('creates the tag and attaches it to the Page', async () => {
    installQueryRouter()
    await groupActivate(ctx(), { groupId: GROUP_ID, rulesVersion: RULES_VERSION, tags: ['Sourdough'] })

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
    await groupActivate(ctx(), { groupId: GROUP_ID, rulesVersion: RULES_VERSION, tags: ['sourdough'] })
    expect(callsMatching(/insert into public\.tags/i)[0]![0]).toMatch(/on conflict \(normalized\) do nothing/i)
    expect(callsMatching(/insert into public\.page_tags/i)).toHaveLength(1)
  })

  it('writes one tag when the same word is sent twice in different shapes', async () => {
    installQueryRouter()
    await groupActivate(ctx(), {
      rulesVersion: RULES_VERSION,
      groupId: GROUP_ID,
      tags: ['Sourdough', ' sour dough ', 'SOURDOUGH'],
    })
    const normalized = callsMatching(/insert into public\.tags/i).map((c) => c[1]![1])
    expect(normalized).toEqual(['sourdough', 'sour dough'])
  })

  it('writes every distinct tag', async () => {
    installQueryRouter()
    await groupActivate(ctx(), { groupId: GROUP_ID, rulesVersion: RULES_VERSION, tags: ['bread', 'pastry', 'cake'] })
    expect(callsMatching(/insert into public\.page_tags/i)).toHaveLength(3)
  })

  it('drops an over-long tag rather than truncating it', async () => {
    installQueryRouter()
    await expect(
      groupActivate(ctx(), { groupId: GROUP_ID, rulesVersion: RULES_VERSION, tags: ['a'.repeat(41)] }),
    ).rejects.toThrow()
  })

  it('never writes a category or a suggestion — both are retired', async () => {
    installQueryRouter()
    await groupActivate(ctx(), { groupId: GROUP_ID, rulesVersion: RULES_VERSION, tags: ['sourdough'] })
    expect(callsMatching(/set category = /i)).toHaveLength(0)
    expect(callsMatching(/group_category_suggestions/i)).toHaveLength(0)
  })
})


// F082 criteria 1, 4, 6 — publishing takes the rules agreement, every time, and
// the agreement is recorded with the version and when. Drafts never ask.
describe('group.activate — the rules agreement (F082)', () => {
  // [guards F082.4]
  it('refuses to publish without an agreement, and publishes nothing', async () => {
    installQueryRouter()
    await expect(groupActivate(ctx(), { groupId: GROUP_ID })).rejects.toThrow(/rules/i)
    expect(callsMatching(/set lifecycle_state = 'active'/i)).toHaveLength(0)
    expect(callsMatching(/creator_rules_agreements/i)).toHaveLength(0)
  })

  // [guards F082.6]
  it('refuses an agreement to an earlier version of the rules', async () => {
    installQueryRouter()
    await expect(
      groupActivate(ctx(), { groupId: GROUP_ID, rulesVersion: RULES_VERSION - 1 }),
    ).rejects.toThrow(/rules/i)
    expect(callsMatching(/set lifecycle_state = 'active'/i)).toHaveLength(0)
  })

  // [guards F082.6]
  it('records who agreed, to which version, for which Page, in the same transaction as the publish', async () => {
    installQueryRouter()
    await groupActivate(ctx(), { groupId: GROUP_ID, rulesVersion: RULES_VERSION })
    const [sql, params] = callsMatching(/insert into public\.creator_rules_agreements/i)[0]!
    expect(params).toEqual([FOUNDER_ID, GROUP_ID, RULES_VERSION])
    expect(sql).not.toMatch(/\$4/)
    expect(callsMatching(/set lifecycle_state = 'active'/i)).toHaveLength(1)
  })

  it('records nothing when the publish itself is refused', async () => {
    installQueryRouter({ description: '' })
    await expect(
      groupActivate(ctx(), { groupId: GROUP_ID, rulesVersion: RULES_VERSION }),
    ).rejects.toThrow(/description/i)
    expect(callsMatching(/creator_rules_agreements/i)).toHaveLength(0)
  })
})
