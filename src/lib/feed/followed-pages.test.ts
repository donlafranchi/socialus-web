// T156 — the "get updates from" set, resolved for the signed-in reader.

import { describe, it, expect, vi } from 'vitest'
import { resolveFollowedPageIds } from './followed-pages'

interface Call {
  table: string
  select: string
  eq: [string, unknown][]
  is: [string, unknown][]
  in: [string, unknown][]
}

function client(rows: unknown[] | null, error: unknown = null) {
  const call: Call = { table: '', select: '', eq: [], is: [], in: [] }
  const builder: Record<string, unknown> = {}
  const chain = () => builder
  builder.select = (s: string) => {
    call.select = s
    return chain()
  }
  builder.eq = (c: string, v: unknown) => {
    call.eq.push([c, v])
    return chain()
  }
  builder.is = (c: string, v: unknown) => {
    call.is.push([c, v])
    return chain()
  }
  builder.in = (c: string, v: unknown) => {
    call.in.push([c, v])
    return chain()
  }
  builder.then = (resolve: (r: unknown) => unknown) => resolve({ data: rows, error })
  return {
    call,
    supabase: {
      from: vi.fn((t: string) => {
        call.table = t
        return builder
      }),
    } as never,
  }
}

describe('T156 — resolveFollowedPageIds', () => {
  it('returns the Pages the member gets updates from', async () => {
    const { supabase } = client([{ group_id: 'g1' }, { group_id: 'g2' }])
    expect(await resolveFollowedPageIds(supabase, 'me')).toEqual(['g1', 'g2'])
  })

  // The signed-out case. It must not reach the database at all: there is no
  // member, so there is no set, and an unscoped read of group_memberships is
  // the wrong shape of question to ask on their behalf.
  it('returns an empty set for a signed-out reader without querying', async () => {
    const { supabase } = client([{ group_id: 'g1' }])
    expect(await resolveFollowedPageIds(supabase, null)).toEqual([])
    expect((supabase as unknown as { from: ReturnType<typeof vi.fn> }).from).not.toHaveBeenCalled()
  })

  it('reads only this member’s own live rows', async () => {
    const { supabase, call } = client([])
    await resolveFollowedPageIds(supabase, 'me')
    expect(call.table).toBe('group_memberships')
    expect(call.eq).toContainEqual(['member_id', 'me'])
    expect(call.is).toContainEqual(['left_at', null])
  })

  // Privacy decides which word is written (Don, 2026-09-15): a private Page is
  // joined as a member, anything else is followed. Both are subscriptions to
  // that Page's updates, so both belong in this set.
  it('counts a follower and a member alike', async () => {
    const { supabase, call } = client([])
    await resolveFollowedPageIds(supabase, 'me')
    expect(call.in).toContainEqual(['relationship', ['follower', 'member']])
  })

  it('de-duplicates, so one Page appears once', async () => {
    const { supabase } = client([{ group_id: 'g1' }, { group_id: 'g1' }])
    expect(await resolveFollowedPageIds(supabase, 'me')).toEqual(['g1'])
  })

  // An empty set and a failed read are indistinguishable downstream — both
  // withhold the personal half — so the failure must be loud here.
  it('throws on a read error rather than quietly returning nothing', async () => {
    const { supabase } = client(null, { message: 'boom' })
    await expect(resolveFollowedPageIds(supabase, 'me')).rejects.toMatchObject({
      message: 'boom',
    })
  })
})
