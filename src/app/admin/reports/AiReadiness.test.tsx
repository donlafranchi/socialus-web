// #640 — the "AI readiness" panel: three harness numbers and the shadow days, each green, amber or red
// (in words as well as colour), and one "ready to go live" light. Staff-only (the page is gated).

import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { AiReadiness } from './AiReadiness'
import { readiness } from '@/lib/moderation/readiness'

const { query, requirePagePermission, rpc } = vi.hoisted(() => ({ query: vi.fn(), requirePagePermission: vi.fn(), rpc: vi.fn() }))
vi.mock('@/actions/_lib/db', () => ({ getPool: () => ({ query }) }))
vi.mock('@/lib/staff/page-guard', () => ({ requirePagePermission }))
vi.mock('@/lib/supabase-server', () => ({ createClient: async () => ({ rpc }) }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/lib/admin/reports-queue', () => ({
  fetchReviewQueue: vi.fn(async () => []),
  fetchWeekSummary: vi.fn(async () => ({ answers: 0, coolDowns: 0 })),
  fetchAiMode: vi.fn(async () => 'shadow'),
}))

afterEach(cleanup)
const NOW = new Date('2026-10-12T12:00:00Z')
const RUN = { runAt: new Date('2026-10-10T12:00:00Z'), cases: 60, recall: 0.97, sev1Cases: 5, sev1Recall: 1, falseAlarmRate: 0.04 }

describe('AiReadiness', () => {
  it('shows each number against its target, with the date of the last run', () => {
    render(<AiReadiness readiness={readiness({ run: RUN, shadowDays: 9, now: NOW })} />)
    const recall = screen.getByTestId('ai-readiness-recall')
    expect(recall).toHaveTextContent('97%')
    expect(recall).toHaveTextContent('target 95% or more')
    expect(recall).toHaveTextContent('Oct 10')
    expect(screen.getByTestId('ai-readiness-sev1')).toHaveTextContent('100%')
    expect(screen.getByTestId('ai-readiness-sev1')).toHaveTextContent('target 100%')
    expect(screen.getByTestId('ai-readiness-false-alarms')).toHaveTextContent('4%')
    expect(screen.getByTestId('ai-readiness-false-alarms')).toHaveTextContent('target under 10%')
    expect(screen.getByTestId('ai-readiness-shadow')).toHaveTextContent('9 of 14 days')
  })

  it('says green, amber or red in words, not only in colour', () => {
    render(<AiReadiness readiness={readiness({ run: { ...RUN, recall: 0.92 }, shadowDays: 9, now: NOW })} />)
    expect(within(screen.getByTestId('ai-readiness-recall')).getByText('Close')).toBeInTheDocument()
    expect(within(screen.getByTestId('ai-readiness-sev1')).getByText('Met')).toBeInTheDocument()
    expect(within(screen.getByTestId('ai-readiness-shadow')).getByText('Close')).toBeInTheDocument()
    render(<AiReadiness readiness={readiness({ run: { ...RUN, falseAlarmRate: 0.4 }, shadowDays: 1, now: NOW })} />)
    expect(within(screen.getAllByTestId('ai-readiness-false-alarms')[1]!).getByText('Not met')).toBeInTheDocument()
  })

  it('has one overall light: ready only when everything is met', () => {
    render(<AiReadiness readiness={readiness({ run: RUN, shadowDays: 14, now: NOW })} />)
    expect(screen.getByTestId('ai-readiness-overall')).toHaveTextContent('Ready to go live')
    cleanup()
    render(<AiReadiness readiness={readiness({ run: RUN, shadowDays: 13, now: NOW })} />)
    expect(screen.getByTestId('ai-readiness-overall')).toHaveTextContent('Not ready to go live yet')
  })

  it('with no harness run it says so instead of showing a number', () => {
    render(<AiReadiness readiness={readiness({ run: null, shadowDays: 0, now: NOW })} />)
    expect(screen.getByTestId('ai-readiness-recall')).toHaveTextContent('No run yet')
    expect(screen.getByTestId('ai-readiness-recall').textContent).not.toMatch(/\d%\s*·/)
  })

  it('a set with no severity-1 cases says what that means', () => {
    render(<AiReadiness readiness={readiness({ run: { ...RUN, sev1Cases: 0, sev1Recall: 0 }, shadowDays: 14, now: NOW })} />)
    expect(screen.getByTestId('ai-readiness-sev1')).toHaveTextContent(/no severity-1 cases/i)
  })

  it('says it is for the flip Don does himself, and that the software does not stop it yet', () => {
    render(<AiReadiness readiness={readiness({ run: RUN, shadowDays: 14, now: NOW })} />)
    expect(screen.getByTestId('ai-readiness')).toHaveTextContent(/nothing stops the switch yet/i)
  })
})

// The beta half of criterion 11 (11a, the PM's call C on #640): the staff-only "AI readiness" panel on
// /admin/reports and the same light on the ops page (/admin/metrics), read end to end from the recorded
// harness run and report_ai_agreement through the real data layer, with only the database faked.
// [guards F100.11 partial: the production half (11b), software that refuses the live flip, is filed separately]
describe('F100.11a — the AI readiness panel and the light', () => {
  const runRow = (over: Record<string, unknown> = {}) => ({ run_at: new Date('2026-10-10T12:00:00Z'), cases: 60, recall: '0.97', sev1_cases: 5, sev1_recall: '1', false_alarm_rate: '0.04', ...over })
  const db = (run: Record<string, unknown> | null, days: number | null) =>
    query.mockImplementation(async (sql: string) => (/moderation_eval_runs/i.test(sql) ? { rows: run ? [run] : [] } : /report_ai_agreement/i.test(sql) ? { rows: [{ days }] } : { rows: [] }))
  const reportsPage = async () => renderToStaticMarkup(await (await import('./page')).default())
  const metricsPage = async () => renderToStaticMarkup(await (await import('../metrics/page')).default())
  const panel = (html: string) => {
    document.body.innerHTML = html
    return screen.getByTestId('ai-readiness')
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
    query.mockReset()
    requirePagePermission.mockReset().mockResolvedValue('staff-1')
    rpc.mockReset().mockResolvedValue({ data: [], error: null })
  })
  afterEach(() => {
    vi.useRealTimers()
    document.body.innerHTML = ''
  })

  it('is staff-only: without the permission both pages 404 and nothing is read', async () => {
    requirePagePermission.mockRejectedValue(new Error('NEXT_NOT_FOUND'))
    await expect(reportsPage()).rejects.toThrow('NEXT_NOT_FOUND')
    await expect(metricsPage()).rejects.toThrow('NEXT_NOT_FOUND')
    expect(requirePagePermission).toHaveBeenCalledWith('reports.review')
    expect(requirePagePermission).toHaveBeenCalledWith('metrics.view')
    expect(query).not.toHaveBeenCalled()
  })

  it('shows recall, severity-1 recall and false alarms, each with its target, colour word and last run date, the shadow days of 14, and one light', async () => {
    db(runRow({ recall: '0.92', false_alarm_rate: '0.4' }), 9)
    const p = within(panel(await reportsPage()))
    const row = (id: string) => p.getByTestId(`ai-readiness-${id}`)
    expect(row('recall')).toHaveTextContent('92% · target 95% or more · run Oct 10')
    expect(within(row('recall')).getByText('Close')).toBeInTheDocument()
    expect(row('sev1')).toHaveTextContent('100% · target 100% · run Oct 10')
    expect(within(row('sev1')).getByText('Met')).toBeInTheDocument()
    expect(row('false-alarms')).toHaveTextContent('40% · target under 10% · run Oct 10')
    expect(within(row('false-alarms')).getByText('Not met')).toBeInTheDocument()
    expect(row('shadow')).toHaveTextContent('9 of 14 days')
    expect(within(row('shadow')).getByText('Close')).toBeInTheDocument()
    expect(p.getByTestId('ai-readiness-overall')).toHaveTextContent('Not ready to go live yet')
    const shadowSql = (query.mock.calls as unknown as [string][]).map(([s]) => s).find((s) => !/moderation_eval_runs/i.test(s))!
    expect(shadowSql).toMatch(/from public\.report_ai_agreement/i)
  })

  it('the light turns on only when every number is met and there are 14 shadow days, on both pages', async () => {
    db(runRow(), 15)
    expect(within(panel(await reportsPage())).getByTestId('ai-readiness-overall')).toHaveTextContent('Ready to go live')
    document.body.innerHTML = await metricsPage()
    expect(screen.getByTestId('ai-readiness-light')).toHaveTextContent('AI readiness: Ready to go live')
    expect(within(screen.getByTestId('ai-readiness-light')).getByRole('link')).toHaveAttribute('href', '/admin/reports')

    db(runRow(), 13)
    expect(within(panel(await reportsPage())).getByTestId('ai-readiness-overall')).toHaveTextContent('Not ready to go live yet')
    document.body.innerHTML = await metricsPage()
    expect(screen.getByTestId('ai-readiness-light')).toHaveTextContent('AI readiness: Not ready to go live yet')
  })

  it('with no recorded run and no shadow days, every number is red and says so', async () => {
    db(null, null)
    const p = within(panel(await reportsPage()))
    for (const id of ['recall', 'sev1', 'false-alarms']) {
      expect(p.getByTestId(`ai-readiness-${id}`)).toHaveTextContent('No run yet')
      expect(within(p.getByTestId(`ai-readiness-${id}`)).getByText('Not met')).toBeInTheDocument()
    }
    expect(p.getByTestId('ai-readiness-shadow')).toHaveTextContent('0 of 14 days')
    expect(p.getByTestId('ai-readiness-overall')).toHaveTextContent('Not ready to go live yet')
  })
})
