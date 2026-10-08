// #222 (F081) — the zip is looked up once to one metro. Nothing else decides it.

import { describe, it, expect, vi } from 'vitest'
import { metroForZip } from './zip-metro'

const SAC = { id: 'metro-sac', name: 'Sacramento-Roseville, CA', slug: 'sacramento-roseville-ca' }

function client(zipRow: { msa_code: string } | null, metroRow: typeof SAC | null = SAC) {
  const from = vi.fn((table: string) => ({
    select: () => ({
      eq: () => ({
        maybeSingle: async () => ({ data: table === 'zip_metro_crosswalk' ? zipRow : metroRow, error: null }),
      }),
    }),
  }))
  return { from } as never
}

describe('metroForZip', () => {
  it('a Sacramento zip resolves to the Sacramento metro', async () => {
    await expect(metroForZip(client({ msa_code: '40900' }), '95819')).resolves.toEqual({ id: 'metro-sac', name: SAC.name })
  })

  it('a zip the crosswalk does not know has no metro (never a default, never a nearest match)', async () => {
    await expect(metroForZip(client(null), '10001')).resolves.toBeNull()
  })

  it('a known zip in an area we do not run in has no metro', async () => {
    await expect(metroForZip(client({ msa_code: '35620' }), '10001')).resolves.toBeNull()
  })

  it('the fictional launch stand-in is not a metro', async () => {
    await expect(metroForZip(client({ msa_code: '99999' }), '99999')).resolves.toBeNull()
  })

  it('a failed read has no metro rather than a guess', async () => {
    const bad = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: { message: 'x' } }) }) }) }) } as never
    await expect(metroForZip(bad, '95819')).resolves.toBeNull()
  })
})
