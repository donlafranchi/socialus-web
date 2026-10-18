import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

// #834 — F078 criterion 11: every string a member meets in the report path, reporter and poster alike, held to the
// PM's recorded copy rules (2026-10-11, #627): no numbers in the misuse warning, "a person from our team" and never
// "a real person", and no developer string ever reaches a member.

const { create } = vi.hoisted(() => ({ create: vi.fn() }))
vi.mock('@/lib/supabase-server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: async () => ({ data: { user: { id: '11111111-1111-1111-1111-111111111111' } }, error: null }) } })),
}))
vi.mock('@/actions', async (importActual) => ({ ...(await importActual<typeof import('@/actions')>()), reportCreate: create }))

import { ReportControl } from './ReportControl'
import { sendReportAction } from '@/app/_actions/report-actions'
import { REPORT_REFUSED } from '@/actions/report/create'
import { ActionError } from '@/actions/_lib/errors'
import { COPY } from '@/lib/copy'
import { REPORT_CATEGORIES } from '@/lib/reports/categories'
import { hiddenNoticeMessage, courtesyNoticeMessage, type ReportSubjectKind } from '@/lib/reports/notices'

afterEach(cleanup)

const KINDS: ReportSubjectKind[] = ['group', 'post', 'page_picture', 'post_photo', 'page_words']
const DEV = /[a-z_]+\.[a-z_]+:|error|undefined|null|NaN|\[object|[{}]|\b[a-z]+_[a-z_]+\b/i

async function reporterSees(): Promise<{ all: string[]; misuse: string[] }> {
  const all: string[] = []
  const misuse: string[] = []
  const send = vi.fn(async (i: { subjectId: string; category: string; body: string }) => sendReportAction(i as never))
  render(<ReportControl subjectId="22222222-2222-2222-2222-222222222222" subjectLabel="Oak Park Bakery" loggedIn onSend={send as never} />)
  fireEvent.click(screen.getByRole('button', { name: /more options/i }))
  fireEvent.click(screen.getByRole('menuitem', { name: /report this/i }))
  for (const radio of screen.getAllByRole('radio')) {
    fireEvent.click(radio)
    all.push(screen.getByRole('dialog').textContent ?? '')
    misuse.push(screen.getByTestId('report-misuse').textContent ?? '')
  }
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Not kind.' } })
  // Each way a send can come back: the two refusals, a developer error, a crash, then a success.
  for (const failure of [
    new ActionError('validation_error', REPORT_REFUSED.alreadyReported),
    new ActionError('validation_error', REPORT_REFUSED.tooManyOpen),
    new ActionError('validation_error', 'report.create: body must not be empty'),
    new Error('connection terminated: db.internal:5432'),
  ]) {
    create.mockRejectedValueOnce(failure)
    fireEvent.click(screen.getByRole('button', { name: /send/i }))
    const alert = await screen.findByRole('alert')
    await waitFor(() => expect(create).toHaveBeenCalled())
    all.push(alert.textContent ?? '')
    create.mockClear()
  }
  create.mockResolvedValueOnce({ reportId: 'r', photoHidden: false })
  fireEvent.click(screen.getByRole('button', { name: /send/i }))
  all.push((await screen.findByRole('status')).textContent ?? '')
  return { all, misuse }
}

describe('F078.11 — the report path is kind and gracious, in the words the PM recorded', () => {
  // [guards F078.11 partial: the PM's final approval of the screenshot storyboard (socialus-plan #94) is a person's call]
  it('reporter and poster: the sheet thanks them for helping us all be good to one another; the misuse warning has no numbers; people on our side are "a person from our team", never "a real person"; no developer string reaches a member', async () => {
    const { all, misuse } = await reporterSees()
    const poster = REPORT_CATEGORIES.flatMap(({ value }) =>
      KINDS.flatMap((k) => [hiddenNoticeMessage('Oak Park Bakery', value, k), courtesyNoticeMessage(value, k)]),
    )
    const copy = [COPY.report911, COPY.reportCourtesy, COPY.reportUrgentSkip, COPY.reportPageWords, COPY.reportPagePhoto, COPY.reportPageWordsSubject, COPY.pageWordsHiddenNote, COPY.reportSentCourtesy, COPY.reportSentPerson]
    const everything = [...all, ...poster, ...copy, ...REPORT_CATEGORIES.map((c) => c.label)]

    expect(all[0]).toContain('Thanks for helping us all be good to one another.')
    expect(all.some((s) => /courtesy notice/i.test(s))).toBe(true)

    for (const line of [...misuse, COPY.reportCourtesy, COPY.reportUrgentSkip]) {
      expect(line).toMatch(/please don't misuse reports/i)
      expect(line).not.toMatch(/\d|\b(two|three|four|five)\b|strike/i)
    }
    for (const s of everything) {
      expect(s).not.toMatch(/real person/i)
      for (const m of s.matchAll(/\bperson\b/gi)) expect(s.slice(m.index! - 2, m.index! + 20), s).toBe('a person from our team')
      expect(s, s).not.toMatch(DEV)
    }
  })
})
