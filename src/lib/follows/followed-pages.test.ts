// #962 — the Pages a member follows, for the Following page and the row on You.

import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { loadFollowedPages, sortFollowedPages, townOf, type FollowedPage } from './followed-pages'

type Call = [string, unknown[]]

function makeClient(tableData: Record<string, unknown[]>) {
  const calls: Record<string, Call[]> = {}
  const from = (name: string) => {
    const rec = (calls[name] = calls[name] ?? [])
    const builder: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'is', 'in', 'not', 'gte', 'order']) {
      builder[m] = (...args: unknown[]) => {
        rec.push([m, args])
        return builder
      }
    }
    builder.then = (resolve: (v: unknown) => unknown) => resolve({ data: tableData[name] ?? [], error: null })
    return builder
  }
  return { client: { from } as unknown as SupabaseClient, calls }
}

const NOW = new Date('2026-10-19T12:00:00Z')

const page = (over: Partial<FollowedPage>): FollowedPage => ({
  groupId: 'g',
  href: '/g/x',
  name: 'X',
  photoUrl: null,
  town: null,
  nextPost: null,
  repeatingSeries: [],
  everyTimeOn: false,
  ...over,
})

describe('sortFollowedPages', () => {
  it('puts the soonest upcoming post first, then Pages with none by name', () => {
    const rows = [
      page({ groupId: 'c', name: 'Cafe' }),
      page({ groupId: 'l', name: 'Later', nextPost: { id: 'p2', startsAt: '2026-10-25T16:00:00Z', title: 'b' } }),
      page({ groupId: 'a', name: 'apple' }),
      page({ groupId: 's', name: 'Soon', nextPost: { id: 'p1', startsAt: '2026-10-20T16:00:00Z', title: 'a' } }),
    ]
    expect(sortFollowedPages(rows).map((r) => r.groupId)).toEqual(['s', 'l', 'a', 'c'])
  })
})

describe('townOf', () => {
  it('uses the place name when the location has one', () => {
    expect(townOf({ label: 'QA Pottery Studio, main spot', places: { display_name: 'Oak Park' } })).toBe('Oak Park')
  })
  it('reads the city out of a street address', () => {
    expect(townOf({ label: '1234 J St, Davis, CA 95616', places: null })).toBe('Davis')
    expect(townOf({ label: '500 Main St, Roseville, CA', places: null })).toBe('Roseville')
  })
  it('says nothing rather than guess from a plain label', () => {
    expect(townOf({ label: 'N904 Bakery', places: null })).toBeNull()
    expect(townOf(null)).toBeNull()
  })
})

describe('loadFollowedPages', () => {
  const data = {
    groups: [
      {
        id: 'g1',
        public_id: 'aaa111',
        name: 'Zest Bakery',
        photo_url: 'https://x/z.jpg',
        photo_hidden_at: null,
        photo_removed_at: null,
        anchor: { label: '1 K St, Sacramento, CA 95814', places: null },
      },
      {
        id: 'g2',
        public_id: 'bbb222',
        name: 'Arden Market',
        photo_url: 'https://x/hidden.jpg',
        photo_hidden_at: '2026-10-01T00:00:00Z',
        photo_removed_at: null,
        anchor: { label: 'Arden', places: { display_name: 'Arden-Arcade' } },
      },
    ],
    page_posts: [
      { id: 'p9', group_id: 'g1', starts_at: '2026-10-30T16:00:00Z', series_id: null, body: 'Pie day\nAll the pies' },
      { id: 'p1', group_id: 'g1', starts_at: '2026-10-21T16:00:00Z', series_id: 's1', body: 'Bread class' },
    ],
    post_reminders: [{ id: 'r1', post_id: null, series_id: 's1' }],
  }

  it('shows each followed Page with photo, town, next post and every-time state', async () => {
    const { client, calls } = makeClient(data)
    const rows = await loadFollowedPages(client, ['g1', 'g2'], NOW)
    expect(rows.map((r) => r.name)).toEqual(['Zest Bakery', 'Arden Market'])
    const [zest, arden] = rows
    expect(zest).toMatchObject({
      href: '/g/aaa111',
      photoUrl: 'https://x/z.jpg',
      town: 'Sacramento',
      nextPost: { id: 'p1', startsAt: '2026-10-21T16:00:00Z', title: 'Bread class' },
      repeatingSeries: ['s1'],
      everyTimeOn: true,
    })
    expect(arden).toMatchObject({ photoUrl: null, town: 'Arden-Arcade', nextPost: null, repeatingSeries: [] })
    // Which Pages comes from getMemberFollows (F065.5); this never reads the follow tables itself.
    expect(calls.group_memberships).toBeUndefined()
    expect(calls.page_posts).toContainEqual(['gte', ['starts_at', NOW.toISOString()]])
    expect(calls.page_posts).toContainEqual(['is', ['sample_kind', null]])
  })

  it('reads nothing for a member who follows nothing', async () => {
    const { client, calls } = makeClient({})
    expect(await loadFollowedPages(client, [], NOW)).toEqual([])
    expect(calls.groups).toBeUndefined()
  })
})
