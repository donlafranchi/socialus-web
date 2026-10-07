import { describe, it, expect, vi } from 'vitest'
import { wherePatch } from './where-save'
import { emptyWhere, type WhereValue } from './WhereFields'

vi.mock('@/app/_actions/location-actions', () => ({}))

const deps = () => ({
  createLocation: vi.fn(async () => ({ ok: true as const, data: { id: 'loc-1', label: 'x' } })),
  metroAnchor: vi.fn(),
  label: vi.fn(async () => '1 Example St'),
})

describe('wherePatch', () => {
  // bug #440 — a Page that chose a neighbourhood must never publish a street address.
  it('saves a neighbourhood as the neighbourhood, never an address point', async () => {
    const d = deps()
    const where: WhereValue = {
      ...emptyWhere,
      mode: 'visit',
      visit: { ...emptyWhere.visit, pin: [-121.49, 38.55], areaOnly: true, area: { id: 'pl-curtis', name: 'Curtis Park' } },
    }
    const out = await wherePatch(where, null, d as never)
    expect(out).toMatchObject({ ok: true, patch: { anchorLocationId: 'loc-1', whereMode: 'visit' } })
    expect(d.createLocation).toHaveBeenCalledWith({ label: 'Curtis Park', neighborhoodId: 'pl-curtis' })
    expect(d.label).not.toHaveBeenCalled()
  })
})
