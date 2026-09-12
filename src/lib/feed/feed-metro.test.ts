// T155 (#52) — the feed's vantage point becomes a metro.
//
// Verified model-independent before lifting, rather than trusted from the
// earlier read: `metro_polygons` (migration 031) references no Item table and
// no `discoverable_items` — it is a geography overlay plus
// `members.home_metro_id`. The precedence rule is a statement about what a
// person meant, not about what they are looking at. Neither is touched by the
// no-Items model change.

import { describe, it, expect, vi } from 'vitest'
import { resolveFeedMetro, listFeedMetros, DEFAULT_METRO_SLUG } from './feed-metro'

const SAC = { id: 'metro-sac', slug: 'sacramento-roseville-ca', name: 'Sacramento-Roseville, CA' }
const PDX = { id: 'metro-pdx', slug: 'portland-vancouver-or-wa', name: 'Portland-Vancouver, OR-WA' }
const ROWS = [SAC, PDX]

/** Minimal metro_polygons stub: eq('id'|'slug', …) then maybeSingle, or a list. */
function client(rows = ROWS) {
  const builder = () => {
    const state: { col?: string; val?: string } = {}
    const b: Record<string, unknown> = {
      select: () => b,
      order: () => Promise.resolve({ data: rows, error: null }),
      eq: (col: string, val: string) => {
        state.col = col
        state.val = val
        return b
      },
      maybeSingle: () =>
        Promise.resolve({
          data:
            rows.find((r) => (state.col === 'id' ? r.id : r.slug) === state.val) ?? null,
          error: null,
        }),
    }
    return b
  }
  return { from: vi.fn(() => builder()) } as never
}

describe('T155 — resolveFeedMetro precedence', () => {
  it('an explicit request wins over a stored member metro', async () => {
    const m = await resolveFeedMetro(client(), { memberMetroId: SAC.id, requestedSlug: PDX.slug })
    expect(m?.slug).toBe(PDX.slug)
  })

  it('falls back to the member metro when nothing was requested', async () => {
    const m = await resolveFeedMetro(client(), { memberMetroId: PDX.id, requestedSlug: null })
    expect(m?.slug).toBe(PDX.slug)
  })

  it('falls back to the default metro when neither resolves', async () => {
    const m = await resolveFeedMetro(client(), { memberMetroId: null, requestedSlug: null })
    expect(m?.slug).toBe(DEFAULT_METRO_SLUG)
  })

  it('lands on the default rather than a blank feed for a member with no home metro', async () => {
    // `members.home_metro_id` is null outside every seeded CSA — the rural
    // fallback. A blank feed is the wrong answer to it.
    const m = await resolveFeedMetro(client(), { memberMetroId: null })
    expect(m).not.toBeNull()
    expect(m?.slug).toBe(DEFAULT_METRO_SLUG)
  })

  it('an unknown requested slug falls through rather than returning empty', async () => {
    const m = await resolveFeedMetro(client(), { memberMetroId: PDX.id, requestedSlug: 'nowhere' })
    expect(m?.slug).toBe(PDX.slug)
  })

  it('an unknown request and an unknown member metro both fall through to the default', async () => {
    const m = await resolveFeedMetro(client(), { memberMetroId: 'gone', requestedSlug: 'nowhere' })
    expect(m?.slug).toBe(DEFAULT_METRO_SLUG)
  })

  it('returns null only when even the default row is missing', async () => {
    expect(await resolveFeedMetro(client([]), {})).toBeNull()
  })

  it('reads metro_polygons and nothing item-shaped', async () => {
    // Guards the model-independence this ticket rests on: if a future edit
    // reaches for discoverable_items here, this fails.
    const c = client()
    await resolveFeedMetro(c, { requestedSlug: SAC.slug })
    const tables = (c as unknown as { from: { mock: { calls: string[][] } } }).from.mock.calls.map((a) => a[0])
    expect(new Set(tables)).toEqual(new Set(['metro_polygons']))
  })
})

describe('T155 — the precedence inversion is deliberate', () => {
  it('inverts resolveFeedPlace, which returns on the stored value first', async () => {
    // resolveFeedPlace checks memberPlaceId before requestedSlug, which is why
    // the shipped scope picker does nothing for a signed-in Member with a home
    // set. Someone who taps the switcher or follows a shared link has stated an
    // intent a stored preference should not override.
    //
    // Asserted as a behavioural difference so the inversion cannot be
    // "tidied away" into consistency with the place path by a later refactor.
    const m = await resolveFeedMetro(client(), { memberMetroId: SAC.id, requestedSlug: PDX.slug })
    expect(m?.id).toBe(PDX.id)
    expect(m?.id).not.toBe(SAC.id)
  })
})

describe('T155 — listFeedMetros', () => {
  it('returns the seeded metros for the switcher', async () => {
    const metros = await listFeedMetros(client())
    expect(metros).toEqual(ROWS)
  })

  it('returns an empty list rather than throwing when none are seeded', async () => {
    expect(await listFeedMetros(client([]))).toEqual([])
  })
})

describe('T155 — DEFAULT_METRO_SLUG', () => {
  it('is the seeded Sacramento CSA', () => {
    expect(DEFAULT_METRO_SLUG).toBe('sacramento-roseville-ca')
  })
})
