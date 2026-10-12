import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ValidationError } from '@/actions/_lib/errors'

const { getUser, zipSet } = vi.hoisted(() => ({ getUser: vi.fn(), zipSet: vi.fn() }))
vi.mock('@/lib/supabase-server', () => ({ createClient: vi.fn(async () => ({ auth: { getUser } })) }))
vi.mock('@/actions', async (importActual) => ({ ...(await importActual<typeof import('@/actions')>()), memberZipSet: zipSet }))

import { changeZipAction } from './zip-actions'

beforeEach(() => {
  getUser.mockReset()
  zipSet.mockReset()
  getUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
})

describe('changeZipAction', () => {
  it('returns the area the zip decided', async () => {
    zipSet.mockResolvedValue({ marketKey: 'sacramento', marketName: 'Sacramento', open: true, homeTown: 'Granite Bay' })
    expect(await changeZipAction('95746')).toEqual({ ok: true, marketName: 'Sacramento', open: true })
    expect(zipSet).toHaveBeenCalledWith(expect.objectContaining({ actingMemberId: 'u1' }), { zip: '95746' })
  })

  it('never hands the home town to the browser', async () => {
    zipSet.mockResolvedValue({ marketKey: 'sacramento', marketName: 'Sacramento', open: true, homeTown: 'Granite Bay' })
    expect(JSON.stringify(await changeZipAction('95746'))).not.toMatch(/Granite Bay|homeTown/)
  })

  it('returns the exact refusal for an unknown zip, as data', async () => {
    zipSet.mockRejectedValue(new ValidationError("We don't recognize that zip, try again."))
    expect(await changeZipAction('00000')).toEqual({ ok: false, message: "We don't recognize that zip, try again." })
  })

  it('any other failure is a plain retry, never the error text', async () => {
    zipSet.mockRejectedValue(new Error('connection terminated'))
    expect(await changeZipAction('95746')).toEqual({ ok: false, message: "That didn't go through. Mind trying again?" })
  })

  it('needs a signed-in member', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null })
    expect(await changeZipAction('95746')).toEqual({ ok: false, message: 'Sign in first.' })
    expect(zipSet).not.toHaveBeenCalled()
  })
})
