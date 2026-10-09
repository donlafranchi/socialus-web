// #544 — /admin/metrics is for staff with metrics.view; anyone else gets the 404 of an address that is not there.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { requirePagePermission, rpc } = vi.hoisted(() => ({
  requirePagePermission: vi.fn(),
  rpc: vi.fn(),
}))
vi.mock('@/lib/staff/page-guard', () => ({ requirePagePermission }))
vi.mock('@/lib/supabase-server', () => ({ createClient: async () => ({ rpc }) }))

import AdminMetricsPage from './page'

beforeEach(() => vi.clearAllMocks())

describe('/admin/metrics', () => {
  it('asks for metrics.view first, and reads nothing when that 404s', async () => {
    requirePagePermission.mockRejectedValue(new Error('NEXT_NOT_FOUND'))
    await expect(AdminMetricsPage()).rejects.toThrow('NEXT_NOT_FOUND')
    expect(requirePagePermission).toHaveBeenCalledWith('metrics.view')
    expect(rpc).not.toHaveBeenCalled()
  })
  it('reads the two weeks through the member\'s own session, so the database checks the role too', async () => {
    requirePagePermission.mockResolvedValue('staff-1')
    rpc.mockResolvedValue({ data: [], error: null })
    const el = await AdminMetricsPage()
    expect(el).toBeTruthy()
    expect(rpc).toHaveBeenCalledWith('admin_metrics_weekly', { p_weeks: 2 })
  })
})
