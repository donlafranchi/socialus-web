import { describe, it, expect, vi } from 'vitest'
import { fetchChoosableMetros, splitByOpen } from './metros'

// "There are no metros to choose from" was never missing data — 296 rows sit in
// `metro_polygons` and the select policy is open to anon and authenticated
// alike. Nothing had ever asked for them.

function client(rows: unknown[] | null, error: { message: string } | null = null) {
  const q: Record<string, unknown> = {}
  q.select = vi.fn(() => q)
  const order = vi.fn(() => q)
  q.order = order
  ;(q as { then: unknown }).then = (res: (v: unknown) => unknown) =>
    Promise.resolve(res({ data: rows, error }))
  return { from: vi.fn(() => q), _order: order }
}

const row = (name: string, slug: string, is_open = false) => ({ id: slug, slug, name, is_open })

describe('fetchChoosableMetros', () => {
  it('reads metro_polygons — the table the data is actually in', async () => {
    const c = client([row('Sacramento-Roseville, CA', 'sacramento-roseville-ca', true)])
    await fetchChoosableMetros(c as never)
    expect(c.from).toHaveBeenCalledWith('metro_polygons')
  })

  it('puts the metros we actually serve first', async () => {
    const c = client([])
    await fetchChoosableMetros(c as never)
    expect(c._order).toHaveBeenCalledWith('is_open', { ascending: false })
    expect(c._order).toHaveBeenCalledWith('name')
  })

  it('returns every metro, open or not — a person can name a place we do not serve', async () => {
    const c = client([
      row('Sacramento-Roseville, CA', 'sacramento-roseville-ca', true),
      row('Boise City, ID', 'boise-city-id'),
    ])
    expect(await fetchChoosableMetros(c as never)).toHaveLength(2)
  })

  it('fails loudly and empty rather than throwing into the page', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const c = client(null, { message: 'boom' })
    expect(await fetchChoosableMetros(c as never)).toEqual([])
    expect(err).toHaveBeenCalled()
    err.mockRestore()
  })
})

describe('splitByOpen', () => {
  // Offering 296 metros as equals would imply we cover all of them.
  it('separates the metros we serve from the ones a person can only name', () => {
    const { open, notYet } = splitByOpen([
      { id: '1', slug: 'sac', name: 'Sacramento', isOpen: true },
      { id: '2', slug: 'boi', name: 'Boise', isOpen: false },
      { id: '3', slug: 'pdx', name: 'Portland', isOpen: false },
    ])
    expect(open.map((m) => m.slug)).toEqual(['sac'])
    expect(notYet.map((m) => m.slug)).toEqual(['boi', 'pdx'])
  })

  it('copes with none open, which is a state the seed data can reach', () => {
    const { open, notYet } = splitByOpen([{ id: '1', slug: 'boi', name: 'Boise', isOpen: false }])
    expect(open).toEqual([])
    expect(notYet).toHaveLength(1)
  })
})
