// F100 criterion 1 — a poster's answer is itself read by the AI, with the reply.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const { getUser, answer, schedule } = vi.hoisted(() => ({ getUser: vi.fn(), answer: vi.fn(), schedule: vi.fn() }))
vi.mock('@/lib/supabase-server', () => ({ createClient: vi.fn(async () => ({ auth: { getUser } })) }))
vi.mock('@/lib/moderation/after-report', () => ({ assessAfterReport: schedule }))
vi.mock('@/actions', async (importActual) => ({ ...(await importActual<typeof import('@/actions')>()), reportAnswer: answer }))

import { answerNoticeAction } from './report-actions'

beforeEach(() => {
  getUser.mockReset()
  answer.mockReset()
  schedule.mockReset()
  getUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
})

describe('answerNoticeAction', () => {
  it('has the AI read the report again with the owner\'s claim', async () => {
    answer.mockResolvedValue({ answerId: 'a1', reportId: 'r1' })
    await answerNoticeAction({ noticeId: 'n1' })
    expect(schedule).toHaveBeenCalledWith('r1', { rebuttal: 'The owner says this is a mistake.' })
  })

  it('a notice with no report behind it schedules nothing', async () => {
    answer.mockResolvedValue({ answerId: 'a1', reportId: null })
    await answerNoticeAction({ noticeId: 'n1' })
    expect(schedule).not.toHaveBeenCalled()
  })

  it('a refused answer schedules nothing', async () => {
    answer.mockRejectedValue(new Error('closed'))
    await expect(answerNoticeAction({ noticeId: 'n1' })).rejects.toThrow()
    expect(schedule).not.toHaveBeenCalled()
  })
})
