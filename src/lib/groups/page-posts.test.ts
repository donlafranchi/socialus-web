import { describe, it, expect, vi } from 'vitest'
import { resolvePagePosts } from './page-posts'
import type { SupabaseClient } from '@supabase/supabase-js'

function client(result: { data: unknown; error: unknown }) {
  const calls: Record<string, unknown[]> = {}
  const chain = {
    select: vi.fn((..._a: unknown[]) => chain),
    eq: vi.fn((...a: unknown[]) => { calls.eq = a; return chain }),
    is: vi.fn((...a: unknown[]) => { calls.is = a; return chain }),
    order: vi.fn((...a: unknown[]) => { calls.order = a; return chain }),
    limit: vi.fn(async () => result),
  }
  return {
    supabase: { from: vi.fn(() => chain) } as unknown as SupabaseClient,
    chain,
    calls,
  }
}

describe('resolvePagePosts', () => {
  it('returns posts newest first, as the caller names them', async () => {
    const { supabase, calls } = client({
      data: [
        {
          id: 'a',
          body: 'Sourdough is back Thursday.',
          created_at: '2026-09-15T10:00:00Z',
          updated_at: '2026-09-15T10:00:00Z',
          starts_at: null,
          location: null,
        },
      ],
      error: null,
    })
    const posts = await resolvePagePosts(supabase, 'g1')
    expect(posts).toEqual([
      {
        id: 'a',
        body: 'Sourdough is back Thursday.',
        createdAt: '2026-09-15T10:00:00Z',
        updatedAt: '2026-09-15T10:00:00Z',
        startsAt: null,
        locationLabel: null,
        howToFind: null,
        photoUrl: null,
        photoHidden: false,
      },
    ])
    expect(calls.order).toEqual(['created_at', { ascending: false }])
  })

  it('adds no visibility filter of its own — RLS is the single answer', async () => {
    const { supabase, chain } = client({ data: [], error: null })
    await resolvePagePosts(supabase, 'g1')
    const eqArgs = chain.eq.mock.calls.map((c) => c[0])
    expect(eqArgs).toEqual(['group_id'])
  })

  // #461 — a deleted post is gone, from its owner too: the owner's own-rows
  // policy still reads it, so the resolver leaves out what was deleted.
  it('leaves out a deleted post, for the owner as for everyone', async () => {
    const { supabase, calls } = client({ data: [], error: null })
    await resolvePagePosts(supabase, 'g1')
    expect(calls.is).toEqual(['dissolved_at', null])
  })

  it('yields no posts when the read fails, rather than throwing', async () => {
    const { supabase } = client({ data: null, error: { message: 'nope' } })
    await expect(resolvePagePosts(supabase, 'g1')).resolves.toEqual([])
  })
})

// F072 — an announcement's own time and its own place.
describe('the time and the place an announcement carries', () => {
  it('projects its own start time', async () => {
    const { supabase } = client({
      data: [
        {
          id: 'a',
          body: 'Bread class Thursday.',
          created_at: '2026-09-15T10:00:00Z',
          updated_at: '2026-09-15T10:00:00Z',
          starts_at: '2026-09-25T02:00:00.000Z',
          location: null,
        },
      ],
      error: null,
    })
    const [post] = await resolvePagePosts(supabase, 'g1')
    expect(post.startsAt).toBe('2026-09-25T02:00:00.000Z')
  })

  it('projects its OWN place, not its Page’s', async () => {
    const { supabase } = client({
      data: [
        {
          id: 'a',
          body: 'Bread class at the church hall.',
          created_at: '2026-09-15T10:00:00Z',
          updated_at: '2026-09-15T10:00:00Z',
          starts_at: null,
          location: { label: 'The church hall' },
        },
      ],
      error: null,
    })
    const [post] = await resolvePagePosts(supabase, 'g1')
    expect(post.locationLabel).toBe('The church hall')
  })

  it('normalises the embed whichever shape PostgREST returns it in', async () => {
    const { supabase } = client({
      data: [
        {
          id: 'a',
          body: 'x',
          created_at: '2026-09-15T10:00:00Z',
          updated_at: '2026-09-15T10:00:00Z',
          starts_at: null,
          location: [{ label: 'The church hall' }],
        },
      ],
      error: null,
    })
    const [post] = await resolvePagePosts(supabase, 'g1')
    expect(post.locationLabel).toBe('The church hall')
  })

  it('leaves both null for an undated, placeless announcement — a first-class one', async () => {
    const { supabase } = client({
      data: [
        {
          id: 'a',
          body: 'Sourdough is back.',
          created_at: '2026-09-15T10:00:00Z',
          updated_at: '2026-09-15T10:00:00Z',
          starts_at: null,
          location: null,
        },
      ],
      error: null,
    })
    const [post] = await resolvePagePosts(supabase, 'g1')
    expect(post.startsAt).toBeNull()
    expect(post.locationLabel).toBeNull()
  })

  it('asks for both, without which the Page cannot render either', async () => {
    const { supabase, chain } = client({ data: [], error: null })
    await resolvePagePosts(supabase, 'g1')
    const selected = String(chain.select.mock.calls[0][0])
    expect(selected).toContain('starts_at')
    expect(selected).toContain('locations(label)')
  })
})

// bug #450 — an address already stored in a post is hidden on the Page.
describe('resolvePagePosts — contact details', () => {
  it('hides an email address in a post body and how to find it', async () => {
    const { supabase } = client({
      data: [{ id: 'a', body: 'Write to a@example.com', created_at: 'x', updated_at: 'x', starts_at: null, how_to_find: 'ask b@example.com', location: null }],
      error: null,
    })
    const [p] = await resolvePagePosts(supabase, 'g1')
    expect(p!.body).not.toContain('@example.com')
    expect(p!.howToFind).not.toContain('@example.com')
  })
})

// F099 criteria 4, 7 — a post's own photo, resolved so a hidden or removed one
// never leaves the server.
describe('a post photo', () => {
  const row = (over: Record<string, unknown>) => ({
    id: 'a', body: 'Bread class.', created_at: '2026-09-15T10:00:00Z', updated_at: '2026-09-15T10:00:00Z',
    starts_at: null, ends_at: null, location: null,
    photo_url: 'https://x/p.webp', photo_hidden_at: null, photo_removed_at: null, ...over,
  })

  // [guards F099.4]
  it("projects the post's own photo, and asks for no Page photo", async () => {
    const { supabase, chain } = client({ data: [row({})], error: null })
    const [p] = await resolvePagePosts(supabase, 'g1')
    expect(p!.photoUrl).toBe('https://x/p.webp')
    const selected = String(chain.select.mock.calls[0]![0])
    expect(selected).toMatch(/photo_url/)
    expect(selected).not.toMatch(/groups|group:/)
  })

  // [guards F099.7]
  it.each([['photo_hidden_at'], ['photo_removed_at']])('a post photo with %s set is not returned', async (col) => {
    const { supabase } = client({ data: [row({ [col]: '2026-10-01T00:00:00Z' })], error: null })
    const [p] = await resolvePagePosts(supabase, 'g1')
    expect(p!.photoUrl).toBeNull()
  })

  // [guards F099.8]
  it('says a post photo is hidden (for its owner’s notice), without returning its URL', async () => {
    const hidden = client({ data: [row({ photo_hidden_at: '2026-10-01T00:00:00Z' })], error: null })
    const [h] = await resolvePagePosts(hidden.supabase, 'g1')
    expect(h!.photoUrl).toBeNull()
    expect(h!.photoHidden).toBe(true)
    const removed = client({ data: [row({ photo_removed_at: '2026-10-01T00:00:00Z' })], error: null })
    expect((await resolvePagePosts(removed.supabase, 'g1'))[0]!.photoHidden).toBe(false)
    const none = client({ data: [row({ photo_url: null })], error: null })
    expect((await resolvePagePosts(none.supabase, 'g1'))[0]!.photoHidden).toBe(false)
  })
})

