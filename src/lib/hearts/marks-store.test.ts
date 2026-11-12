import { describe, it, expect, vi } from 'vitest'

// #1171 — one member's hearts and saves never outlive their session on a shared tab.
let authCb: ((event: string) => void) | null = null
let user: { id: string } | null = { id: 'ana' }
let rows = { hearts: [{ post_id: 'p1', group_id: null }], saves: [{ post_id: 'p1' }] }
vi.mock('@/lib/supabase', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user } }), onAuthStateChange: (cb: (e: string) => void) => ((authCb = cb), { data: { subscription: { unsubscribe() {} } } }) },
    from: (t: 'hearts' | 'saves') => ({ select: async () => ({ data: rows[t] }) }),
  }),
}))

import { useMarks } from './marks-store'
import { renderHook, waitFor, act } from '@testing-library/react'

describe('the marks store', () => {
  it('loads the member’s own marks, clears them on sign-out, and loads the next member’s on sign-in', async () => {
    const { result } = renderHook(() => useMarks())
    await waitFor(() => expect(result.current.signedIn).toBe(true))
    expect(result.current.heartedPosts.has('p1')).toBe(true)
    user = null
    act(() => authCb!('SIGNED_OUT'))
    expect(result.current.signedIn).toBe(false)
    expect(result.current.heartedPosts.size).toBe(0)
    expect(result.current.savedPosts.size).toBe(0)
    user = { id: 'bea' }
    rows = { hearts: [], saves: [{ post_id: 'p9' }] }
    act(() => authCb!('SIGNED_IN'))
    await waitFor(() => expect(result.current.signedIn).toBe(true))
    expect(result.current.heartedPosts.has('p1')).toBe(false)
    expect(result.current.savedPosts.has('p9')).toBe(true)
  })
})
