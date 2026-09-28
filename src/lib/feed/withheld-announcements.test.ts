// F093 — the signed-out read path, at the seam where a row becomes a card.
//
// The database half of this is tests/announcements-signed-out-rest.test.ts,
// which is where criterion 1 is actually discharged. What is left for here is
// the part SQL cannot state: that the shape handed to the surface carries no
// body, no time and no place, whatever the row happened to contain.

import { describe, it, expect, vi } from 'vitest'
import { getWithheldAnnouncements, mapWithheldRow } from './withheld-announcements'
import { mapBrowseRow, type BrowseFeedRow } from './browse-feed'

const ROW = {
  result_id: '11111111-1111-4111-8111-111111111111',
  group_id: '22222222-2222-4222-8222-222222222222',
  slug: 'sacriver-floaters',
  name: 'SacRiver Floaters',
  public_id: '3k8x0p',
  photo_url: 'https://example.test/floaters.jpg',
  announcement_count: 3,
  announcement_ids: ['11111111-1111-4111-8111-111111111111', '33333333-3333-4333-8333-333333333333'],
  updated_at: '2026-09-23T16:00:00.000Z',
}

function client(data: unknown, error: unknown = null) {
  return { rpc: vi.fn().mockResolvedValue({ data, error }) }
}

describe('mapWithheldRow', () => {
  it('marks the result withheld, so no surface has to infer it', () => {
    expect(mapWithheldRow(ROW).withheld).toBe(true)
  })

  it('carries the Page name and the count', () => {
    const r = mapWithheldRow(ROW)
    expect(r.name).toBe('SacRiver Floaters')
    expect(r.announcementCount).toBe(3)
  })

  it("carries the Page's photo, which the database already resolved", () => {
    expect(mapWithheldRow(ROW).photoUrl).toBe('https://example.test/floaters.jpg')
  })

  it('carries every announcement id the card answers to', () => {
    expect(mapWithheldRow(ROW).announcementIds).toEqual(ROW.announcement_ids)
  })

  it('carries no body, no time and no place', () => {
    const r = mapWithheldRow(ROW)
    expect(r.body).toBeNull()
    expect(r.startsAt).toBeNull()
    expect(r.locationLabel).toBeNull()
    expect(r.locationId).toBeNull()
    expect(r.description).toBeNull()
  })

  it('carries no map point, because a pin is the place', () => {
    const r = mapWithheldRow(ROW)
    expect(r.longitude).toBeNull()
    expect(r.latitude).toBeNull()
  })

  it('links to its own announcement on the Page, so the anchor resolves', () => {
    // Criterion 9. The same fragment #212 built — one constant, written by the
    // feed and read by the Page.
    expect(mapWithheldRow(ROW).href).toBe(
      '/g/sacriver-floaters-3k8x0p#announcement-11111111-1111-4111-8111-111111111111',
    )
  })

  it('has no link at all when the Page has no address to resolve', () => {
    // A bare fragment would look live and go nowhere, which is worse than no
    // link — the rule resultHref already follows.
    expect(mapWithheldRow({ ...ROW, public_id: null }).href).toBeNull()
  })

  it('is a post result, so signed-out Explore still has post-kind rows', () => {
    // Criterion 7: they render in withheld form; they do not disappear.
    expect(mapWithheldRow(ROW).resultKind).toBe('post')
  })
})

describe('getWithheldAnnouncements', () => {
  it('asks for the metro scope and the period it was given', async () => {
    const supabase = client([ROW])
    await getWithheldAnnouncements(supabase, {
      scope: { metroId: 'metro-1' },
      period: { from: '2026-09-21T07:00:00.000Z', to: '2026-09-28T07:00:00.000Z' },
      limit: 100,
    })
    expect(supabase.rpc).toHaveBeenCalledWith(
      'announcements_withheld',
      expect.objectContaining({
        p_metro_id: 'metro-1',
        p_group_id: null,
        p_period_from: '2026-09-21T07:00:00.000Z',
        p_period_to: '2026-09-28T07:00:00.000Z',
      }),
    )
  })

  it('asks for one Page when scoped to a group', async () => {
    const supabase = client([ROW])
    await getWithheldAnnouncements(supabase, { scope: { groupId: 'group-1' } })
    expect(supabase.rpc).toHaveBeenCalledWith(
      'announcements_withheld',
      expect.objectContaining({ p_group_id: 'group-1', p_metro_id: null }),
    )
  })

  it('never names a withheld column in the call', async () => {
    // The function has no such parameters, so this would be a 404 from
    // PostgREST rather than a leak — but a caller reaching for them is the
    // tell that someone is about to add one.
    const supabase = client([ROW])
    await getWithheldAnnouncements(supabase, { scope: { metroId: 'metro-1' } })
    const args = JSON.stringify(supabase.rpc.mock.calls[0]![1])
    for (const c of ['body', 'starts_at', 'location']) expect(args).not.toContain(c)
  })

  it('throws on a read error rather than returning an empty list', async () => {
    // Same rule getBrowseFeed follows: an empty surface that means "broken"
    // must not read as "nothing is happening here".
    const supabase = client(null, { message: 'boom' })
    await expect(
      getWithheldAnnouncements(supabase, { scope: { metroId: 'metro-1' } }),
    ).rejects.toBeTruthy()
  })
})

describe('mapBrowseRow — the signed-in path is untouched', () => {
  const full: BrowseFeedRow = {
    result_kind: 'post',
    result_id: ROW.result_id,
    group_id: ROW.group_id,
    group_kind: 'interest',
    slug: ROW.slug,
    name: ROW.name,
    place_path: null,
    photo_url: null,
    photo_hidden_at: null,
    photo_removed_at: null,
    description: null,
    body: 'We are meeting Thursday at 2pm at the river',
    tags: [],
    starts_at: '2026-09-24T02:12:00.000Z',
    location_id: '44444444-4444-4444-8444-444444444444',
    location_label: 'The river',
    location_geography: null,
    page_created_at: '2026-09-01T00:00:00.000Z',
    updated_at: ROW.updated_at,
    sort_at: ROW.updated_at,
  }

  it('is not withheld, and says so explicitly', () => {
    // Criterion 6. The flag is false rather than absent so that a surface
    // reading `withheld` never has to treat undefined as a third state.
    expect(mapBrowseRow(full, ROW.public_id).withheld).toBe(false)
  })

  it('still carries the body, the time and the place', () => {
    const r = mapBrowseRow(full, ROW.public_id)
    expect(r.body).toBe('We are meeting Thursday at 2pm at the river')
    expect(r.startsAt).toBe('2026-09-24T02:12:00.000Z')
    expect(r.locationLabel).toBe('The river')
  })

  it('has no count, because a member reads the announcement itself', () => {
    expect(mapBrowseRow(full, ROW.public_id).announcementCount).toBeNull()
  })
})
