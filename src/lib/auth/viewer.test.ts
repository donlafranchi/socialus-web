// #791 — who is looking, without a round trip to the auth server.
import { describe, it, expect, vi } from 'vitest'
import { viewerId } from './viewer'

const client = (getClaims: () => unknown) => {
  const getUser = vi.fn()
  return { supabase: { auth: { getClaims: vi.fn(getClaims), getUser } } as never, getUser }
}

describe('viewerId', () => {
  it('reads the member from the verified session claims', async () => {
    const { supabase, getUser } = client(async () => ({ data: { claims: { sub: 'm-1' } }, error: null }))
    expect(await viewerId(supabase)).toBe('m-1')
    expect(getUser).not.toHaveBeenCalled()
  })
  it('signed out is null', async () => {
    expect(await viewerId(client(async () => ({ data: null, error: null })).supabase)).toBeNull()
  })
  it('a token that fails verification is signed out, never an error', async () => {
    expect(await viewerId(client(async () => ({ data: null, error: new Error('invalid JWT') })).supabase)).toBeNull()
    expect(await viewerId(client(async () => { throw new Error('Invalid Refresh Token') }).supabase)).toBeNull()
  })
})
