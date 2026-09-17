import { describe, it, expect } from 'vitest'
import { resolveFeedPlace, LAUNCH_PLACE_SLUG } from '../src/lib/feed/feed-place'

// T088 — resolveFeedPlace precedence against a fake Supabase `from` client.
// byId(...) ends in .maybeSingle(); bySlug(...) awaits the builder (list).

function makeClient(opts: {
  byId?: Record<string, { id: string; display_name: string; slug: string }>
  bySlug?: Record<string, { id: string; display_name: string; slug: string; kind: string }[]>
}) {
  return {
    from(_table: string) {
      const state: { idVal?: string; slugVal?: string } = {}
      const builder: Record<string, unknown> = {}
      builder.select = () => builder
      builder.is = () => builder
      builder.eq = (col: string, val: string) => {
        if (col === 'id') state.idVal = val
        if (col === 'slug') state.slugVal = val
        return builder
      }
      builder.maybeSingle = async () => ({
        data: state.idVal ? (opts.byId?.[state.idVal] ?? null) : null,
        error: null,
      })
      // Thenable for the bySlug list path.
      builder.then = (resolve: (v: unknown) => void) =>
        resolve({ data: state.slugVal ? (opts.bySlug?.[state.slugVal] ?? []) : [], error: null })
      return builder
    },
  }
}

const SAC = { id: 'sac', display_name: 'Sacramento', slug: 'sacramento', kind: 'city' }
const OAK = { id: 'oak', display_name: 'Oak Park', slug: 'oak-park', kind: 'neighborhood' }

describe('T088 — resolveFeedPlace precedence', () => {
  // CORRECTED 2026-09-17. This asserted that the stored primary_home BEAT an
  // explicitly requested slug — which is the bug, not the contract: a member
  // with a stored place could tap the scope picker and nothing would happen.
  // `feed-metro.ts` had named it in a comment for weeks. An explicit act by a
  // person beats a stored default.
  it('prefers an explicitly requested slug over the member primary_home', async () => {
    const client = makeClient({
      byId: { oak: OAK },
      bySlug: { sacramento: [SAC], 'oak-park': [OAK], [LAUNCH_PLACE_SLUG]: [SAC] },
    })
    const out = await resolveFeedPlace(client as never, {
      memberPlaceId: 'oak',
      requestedSlug: 'sacramento',
    })
    expect(out).toEqual({
      placeId: 'sac',
      displayName: 'Sacramento',
      slug: 'sacramento',
      source: 'requested',
    })
  })

  it('falls back to the member primary_home when nothing was requested', async () => {
    const client = makeClient({
      byId: { oak: OAK },
      bySlug: { [LAUNCH_PLACE_SLUG]: [SAC] },
    })
    const out = await resolveFeedPlace(client as never, { memberPlaceId: 'oak' })
    expect(out).toEqual({
      placeId: 'oak',
      displayName: 'Oak Park',
      slug: 'oak-park',
      source: 'member',
    })
  })

  it('falls to the requested slug when no member home', async () => {
    const client = makeClient({ bySlug: { 'oak-park': [OAK], [LAUNCH_PLACE_SLUG]: [SAC] } })
    const out = await resolveFeedPlace(client as never, { requestedSlug: 'oak-park' })
    expect(out?.slug).toBe('oak-park')
  })

  it('falls to the launch default when nothing requested', async () => {
    const client = makeClient({ bySlug: { [LAUNCH_PLACE_SLUG]: [SAC] } })
    const out = await resolveFeedPlace(client as never, {})
    expect(out?.slug).toBe('sacramento')
  })

  it('returns null when even the default is missing', async () => {
    const client = makeClient({ bySlug: {} })
    expect(await resolveFeedPlace(client as never, {})).toBeNull()
  })

  it('disambiguates a slug collision to the most specific kind', async () => {
    const client = makeClient({
      bySlug: {
        sacramento: [
          { id: 'sac-county', display_name: 'Sacramento', slug: 'sacramento', kind: 'county' },
          SAC,
        ],
      },
    })
    const out = await resolveFeedPlace(client as never, { requestedSlug: 'sacramento' })
    expect(out?.placeId).toBe('sac') // city beats county
  })
})
