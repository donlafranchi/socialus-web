import { describe, it, expect, vi } from 'vitest'
import { resolveFeedPlace, LAUNCH_PLACE_SLUG } from './feed-place'

// The bug: precedence put the member's stored place BEFORE the requested slug,
// so a scope picker fired, the resolver returned the stored value, and nothing
// changed. `feed-metro.ts` named it in a comment — "the reason the shipped
// scope picker does nothing" — and it is Don's "I have the good place, can't
// change it".
//
// An explicit act by a person beats a stored default. That is the whole rule.

const PLACES: Record<string, { id: string; display_name: string; slug: string; kind: string }> = {
  'the-good-place': { id: 'p-default', display_name: 'The Good Place', slug: 'the-good-place', kind: 'city' },
  sacramento: { id: 'p-sac', display_name: 'Sacramento', slug: 'sacramento', kind: 'city' },
  'east-sacramento': { id: 'p-east', display_name: 'East Sacramento', slug: 'east-sacramento', kind: 'neighborhood' },
}
const BY_ID: Record<string, (typeof PLACES)[string]> = Object.fromEntries(
  Object.values(PLACES).map((p) => [p.id, p]),
)

function client(rowsForSlug?: (typeof PLACES)[string][]) {
  return {
    from: vi.fn(() => {
      const q: Record<string, unknown> = {}
      let wantedSlug: string | null = null
      let wantedId: string | null = null
      q.select = vi.fn(() => q)
      q.eq = vi.fn((col: string, val: string) => {
        if (col === 'slug') wantedSlug = val
        if (col === 'id') wantedId = val
        return q
      })
      q.is = vi.fn(() => q)
      q.maybeSingle = vi.fn(async () => ({ data: wantedId ? (BY_ID[wantedId] ?? null) : null, error: null }))
      // bySlug awaits the builder itself.
      ;(q as { then: unknown }).then = (res: (v: unknown) => unknown) => {
        const rows = rowsForSlug ?? (wantedSlug && PLACES[wantedSlug] ? [PLACES[wantedSlug]] : [])
        return Promise.resolve(res({ data: rows, error: null }))
      }
      return q
    }),
  }
}

describe('resolveFeedPlace precedence', () => {
  // THE BUG.
  it('an explicitly requested slug beats the member’s stored place', async () => {
    const p = await resolveFeedPlace(client() as never, {
      memberPlaceId: 'p-default',
      requestedSlug: 'sacramento',
    })
    expect(p?.slug).toBe('sacramento')
    expect(p?.source).toBe('requested')
  })

  it('falls back to the stored place when nothing was requested', async () => {
    const p = await resolveFeedPlace(client() as never, { memberPlaceId: 'p-sac' })
    expect(p?.slug).toBe('sacramento')
    expect(p?.source).toBe('member')
  })

  it('falls back to the launch default when there is neither', async () => {
    const p = await resolveFeedPlace(client() as never, {})
    expect(p?.slug).toBe(LAUNCH_PLACE_SLUG)
    expect(p?.source).toBe('default')
  })

  // A slug that resolves to nothing must not strand the person on an empty
  // surface — but it also must not silently masquerade as their choice.
  it('falls through to the stored place when the requested slug does not exist', async () => {
    const p = await resolveFeedPlace(client([]) as never, {
      memberPlaceId: 'p-sac',
      requestedSlug: 'nowhere',
    })
    expect(p?.slug).toBe('sacramento')
    expect(p?.source).toBe('member')
  })

  it('reports the source so a caller can say how the place was chosen', async () => {
    const a = await resolveFeedPlace(client() as never, { requestedSlug: 'east-sacramento' })
    expect(a?.source).toBe('requested')
    const b = await resolveFeedPlace(client() as never, {})
    expect(b?.source).toBe('default')
  })
})
