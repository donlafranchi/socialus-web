// Only staff who review reports may ask; the answer is one of four words, never the key.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const { getUser, staffCan, check } = vi.hoisted(() => ({ getUser: vi.fn(), staffCan: vi.fn(), check: vi.fn() }))
vi.mock('@/lib/supabase-server', () => ({ createClient: vi.fn(async () => ({ auth: { getUser } })) }))
vi.mock('@/actions/_lib/db', () => ({ getPool: () => ({}) }))
vi.mock('@/lib/staff/permissions', () => ({ staffCan }))
vi.mock('@/lib/moderation/key-check', () => ({ checkModerationKey: check }))

import { checkAiKeyAction } from './key-check-action'

beforeEach(() => {
  getUser.mockReset()
  staffCan.mockReset()
  check.mockReset()
  getUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
})

describe('checkAiKeyAction', () => {
  it('asks for reports.review, and returns what the check found', async () => {
    staffCan.mockResolvedValue(true)
    check.mockResolvedValue('connected')
    expect(await checkAiKeyAction()).toBe('connected')
    expect(staffCan).toHaveBeenCalledWith(expect.anything(), 'u1', 'reports.review')
  })

  it('makes no call for anyone without it', async () => {
    staffCan.mockResolvedValue(false)
    await expect(checkAiKeyAction()).rejects.toThrow(/not permitted/i)
    expect(check).not.toHaveBeenCalled()
  })

  it('makes no call for someone signed out', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null })
    await expect(checkAiKeyAction()).rejects.toThrow(/not permitted/i)
    expect(check).not.toHaveBeenCalled()
  })
})
