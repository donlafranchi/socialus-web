// #909 — the owner card's read: the database decides who may see it and enforces the minimum of 3; this splits the lists.
import { describe, it, expect, vi } from 'vitest'
import { loadPageSearchDemand } from './page-demand'

const client = (result: { data: unknown; error: unknown }) => ({ rpc: vi.fn(async () => result) })

describe('loadPageSearchDemand', () => {
  it('splits the rows into terms that fit the Page and terms that found nothing', async () => {
    const c = client({ data: [{ list: 'fit', query: 'sourdough', searches: 4 }, { list: 'zero', query: 'ferret food', searches: 3 }], error: null })
    expect(await loadPageSearchDemand(c as never, 'g1')).toEqual({ fit: [{ query: 'sourdough', searches: 4 }], zero: [{ query: 'ferret food', searches: 3 }] })
    expect(c.rpc).toHaveBeenCalledWith('page_search_demand', { p_group_id: 'g1' })
  })

  it('drops anything under 3 even if the database ever sent it', async () => {
    const c = client({ data: [{ list: 'fit', query: 'once', searches: 1 }], error: null })
    expect(await loadPageSearchDemand(c as never, 'g1')).toBeNull()
  })

  it('is null when there is nothing, or the read fails', async () => {
    expect(await loadPageSearchDemand(client({ data: [], error: null }) as never, 'g1')).toBeNull()
    expect(await loadPageSearchDemand(client({ data: null, error: { message: 'x' } }) as never, 'g1')).toBeNull()
  })
})
