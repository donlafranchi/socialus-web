// #348 — where a Page is: one question, three answers (Don, 2026-10-04).

import { describe, it, expect, vi } from 'vitest'
import { whereInput, applyWhere } from './where'

const GROUP = '11111111-1111-1111-1111-111111111111'
const TOWN_A = '22222222-2222-2222-2222-222222222222'
const TOWN_B = '33333333-3333-3333-3333-333333333333'

function run(input: Parameters<typeof applyWhere>[2]) {
  const query = vi.fn(async () => ({ rows: [], rowCount: 0 }))
  const fragments: { clause: string; value: unknown }[] = []
  const patched: string[] = []
  return applyWhere({ query } as never, GROUP, input, fragments, patched).then(() => ({ query, fragments, patched }))
}

describe('#348 — where a Page is', () => {
  it('records the answer and the one-line notes', async () => {
    const { fragments, patched } = await run({ whereMode: 'visit', howToFind: '  Trailhead behind the barn  ', usuallyAround: null })
    expect(fragments).toEqual([
      { clause: 'where_mode = $', value: 'visit' },
      { clause: 'how_to_find = $', value: 'Trailhead behind the barn' },
      { clause: 'usually_around = $', value: null },
    ])
    expect(patched).toEqual(['where_mode', 'how_to_find', 'usually_around'])
  })

  it('an empty note is cleared, not stored as blank', async () => {
    const { fragments } = await run({ howToFind: '   ' })
    expect(fragments).toEqual([{ clause: 'how_to_find = $', value: null }])
  })

  it('refuses an answer that is not one of the three', () => {
    expect(whereInput.safeParse({ whereMode: 'anywhere' }).success).toBe(false)
  })

  it('refuses a note longer than one line', () => {
    expect(whereInput.safeParse({ howToFind: 'x'.repeat(141) }).success).toBe(false)
    expect(whereInput.safeParse({ usuallyAround: 'x'.repeat(81) }).success).toBe(false)
  })

  it('replaces the towns served with the set given', async () => {
    const { query, patched } = await run({ serviceAreaPlaceIds: [TOWN_A, TOWN_B, TOWN_A] })
    const sqls = (query.mock.calls as unknown as [string, unknown[]][]).map(([s, p]) => [s.replace(/\s+/g, ' ').trim(), p])
    expect(sqls[0]![0]).toMatch(/^delete from public\.page_service_areas where group_id = \$1/)
    expect(sqls[1]![0]).toMatch(/^insert into public\.page_service_areas/)
    expect(sqls[1]![1]).toEqual([GROUP, [TOWN_A, TOWN_B]])
    expect(patched).toContain('service_areas')
  })

  it('no towns means the whole metro: the set is emptied', async () => {
    const { query } = await run({ serviceAreaPlaceIds: [] })
    expect(query).toHaveBeenCalledTimes(1)
  })

  it('touches nothing it was not given', async () => {
    const { query, fragments } = await run({})
    expect(fragments).toEqual([])
    expect(query).not.toHaveBeenCalled()
  })
})

// #896 — more answers for a Page with no street address, and its stops.
describe('#896 — landmark, more than one location, a where-and-when list, online', () => {
  it('accepts the six answers and nothing else', () => {
    for (const m of ['visit', 'landmark', 'multi', 'roaming', 'travel', 'online']) expect(whereInput.safeParse({ whereMode: m }).success).toBe(true)
  })

  it('replaces the stops with the list given, in order, blank rows dropped', async () => {
    const { query, patched } = await run({
      stops: [
        { label: ' Midtown Farmers Market ', whenText: ' Saturdays, 8am–1pm ' },
        { label: '   ', whenText: 'Sundays' },
        { label: 'Oak Park Sunday Market', whenText: '' },
      ],
    })
    const calls = query.mock.calls as unknown as [string, unknown[]][]
    expect(calls[0]![0]).toMatch(/delete from public\.page_stops where group_id = \$1/)
    expect(calls[1]![0]).toMatch(/insert into public\.page_stops/)
    expect(calls[1]![1]).toEqual([GROUP, ['Midtown Farmers Market', 'Oak Park Sunday Market'], ['Saturdays, 8am–1pm', null]])
    expect(patched).toContain('stops')
  })

  it('an empty list clears them', async () => {
    const { query } = await run({ stops: [] })
    expect(query).toHaveBeenCalledTimes(1)
  })

  it('refuses more than twenty stops, or one too long', () => {
    expect(whereInput.safeParse({ stops: Array.from({ length: 21 }, () => ({ label: 'x', whenText: null })) }).success).toBe(false)
    expect(whereInput.safeParse({ stops: [{ label: 'x'.repeat(121), whenText: null }] }).success).toBe(false)
    expect(whereInput.safeParse({ stops: [{ label: 'x', whenText: 'x'.repeat(81) }] }).success).toBe(false)
  })
})
