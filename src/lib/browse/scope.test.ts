import { describe, it, expect } from 'vitest'
import { resolveBrowseScope } from './scope'

const ROW_SAC = { id: 'metro-sac', slug: 'sacramento-roseville-ca', name: 'Sacramento-Roseville, CA', is_open: true }
const ROW_PDX = { id: 'metro-pdx', slug: 'portland-vancouver-or-wa', name: 'Portland-Vancouver, OR-WA', is_open: true }
const SAC = { id: ROW_SAC.id, slug: ROW_SAC.slug, name: ROW_SAC.name, isOpen: true }
const PDX = { id: ROW_PDX.id, slug: ROW_PDX.slug, name: ROW_PDX.name, isOpen: true }

function client(rows = [ROW_SAC, ROW_PDX]) {
  return {
    from: () => {
      const state: { col?: string; val?: string } = {}
      const b: Record<string, unknown> = {
        select: () => b,
        eq: (col: string, val: string) => {
          state.col = col
          state.val = val
          return b
        },
        maybeSingle: () =>
          Promise.resolve({
            data: rows.find((r) => r[state.col as 'id' | 'slug'] === state.val) ?? null,
            error: null,
          }),
      }
      return b
    },
  } as never
}

describe('T156 — resolveBrowseScope', () => {
  it('an explicit ?metro= is chosen', async () => {
    const scope = await resolveBrowseScope(client(), { requestedSlug: 'portland-vancouver-or-wa' })
    expect(scope).toEqual({ metro: PDX, chosen: true })
  })

  it('a stored home metro away from the default is chosen', async () => {
    const scope = await resolveBrowseScope(client(), { memberMetroId: 'metro-pdx' })
    expect(scope).toEqual({ metro: PDX, chosen: true })
  })

  it('a stored home metro equal to the seeded default is NOT chosen — onboarding wrote it, nobody picked it', async () => {
    const scope = await resolveBrowseScope(client(), { memberMetroId: 'metro-sac' })
    expect(scope).toEqual({ metro: SAC, chosen: false })
  })

  it('the fallback default is not chosen', async () => {
    const scope = await resolveBrowseScope(client(), {})
    expect(scope).toEqual({ metro: SAC, chosen: false })
  })

  it('a stale ?metro= falls through to the default rather than blanking Browse', async () => {
    const scope = await resolveBrowseScope(client(), { requestedSlug: 'atlantis-xx' })
    expect(scope).toEqual({ metro: SAC, chosen: false })
  })

  it('returns null when nothing resolves at all', async () => {
    expect(await resolveBrowseScope(client([]), {})).toBeNull()
  })

  // #329/#330 — the pill remembers.
  it("a member's default metro beats the one derived from their zip", async () => {
    const scope = await resolveBrowseScope(client(), { memberMetroId: 'metro-sac', memberDefaultMetroId: 'metro-pdx' })
    expect(scope).toEqual({ metro: PDX, chosen: true })
  })

  it('a remembered slug is used when nothing is requested, and counts as chosen', async () => {
    const scope = await resolveBrowseScope(client(), { rememberedSlug: 'portland-vancouver-or-wa' })
    expect(scope).toEqual({ metro: PDX, chosen: true })
  })

  it('an explicit ?metro= beats a remembered slug', async () => {
    const scope = await resolveBrowseScope(client(), {
      requestedSlug: 'sacramento-roseville-ca',
      rememberedSlug: 'portland-vancouver-or-wa',
    })
    expect(scope?.metro).toEqual(SAC)
  })

  it('a stale remembered slug falls through to the zip metro', async () => {
    const scope = await resolveBrowseScope(client(), { rememberedSlug: 'atlantis-xx', memberMetroId: 'metro-pdx' })
    expect(scope?.metro).toEqual(PDX)
  })
})
