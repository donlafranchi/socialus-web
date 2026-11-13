// F134 criterion 4 — every write asks first: signed out, heart, save, get updates, join, Remind me, "I'm in", a
// neighbour post's answer and report each open the sign-in sheet and save nothing; back from sign-in, the tap
// completes once. A control that saves and then asks fails this (the spy would have been called), and so does one
// that finishes a tap from the address alone: a link someone sends never writes for a member (review of #1278).
//
// RSVP is the Wonder's "I'm in" (no other RSVP control exists); post, reply and message have no control a visitor can
// reach (a Page's composer is its owner's, a neighbour post is composed behind /neighbors/new, which signs in first).

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor, act } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

const setHeartAction = vi.fn()
const setSaveAction = vi.fn()
vi.mock('@/app/_actions/heart-save-actions', () => ({ setHeartAction: (i: unknown) => setHeartAction(i), setSaveAction: (i: unknown) => setSaveAction(i) }))
vi.mock('@/lib/supabase', () => ({ createClient: () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }) }))

import { HeartButton, SaveButton } from '@/components/hearts/HeartSave'
import { FollowPageButton } from '@/components/group/FollowPageButton'
import { ReportControl } from '@/components/group/ReportControl'
import { RemindMeButton } from '@/components/reminders/RemindMe'
import { WonderPanel, type WonderActions } from '@/components/wonders/WonderPanel'
import { MemberPostView } from '@/components/member-posts/MemberPostView'
import { resetMarks } from '@/lib/hearts/marks-store'
import type { MemberPost } from '@/lib/member-posts/read'
import { COPY } from '@/lib/copy'

const POST = '00000000-0000-4000-8000-0000000f1340'
const PAGE = '00000000-0000-4000-8000-0000000f1341'
const RETURN = '/g/kite-club'
const WONDER_POST = '00000000-0000-4000-8000-0000000f1342'

afterEach(() => {
  cleanup()
  window.history.replaceState(null, '', '/')
})
beforeEach(() => {
  setHeartAction.mockReset().mockResolvedValue({ ok: true, on: true })
  setSaveAction.mockReset().mockResolvedValue({ ok: true, on: true })
})

/** The sheet is open, and its link carries the intent for exactly what was tapped. */
function expectAsked(intent: string) {
  const link = screen.getByTestId('sign-in-prompt-continue')
  const next = decodeURIComponent(link.getAttribute('href')!.split('next=')[1]!)
  expect(new URL(next, 'http://x').searchParams.get('intent')).toBe(intent)
}

/** Back from sign-in: the address carries the intent the sheet sent. */
const comeBack = (intent: string) => window.history.replaceState(null, '', `${RETURN}?intent=${encodeURIComponent(intent)}`)

const wonderActions = (): WonderActions => ({
  join: vi.fn(async () => ({ ok: true as const, inCount: 1 })),
  leave: vi.fn(async () => ({ ok: true as const, inCount: 0 })),
  offer: vi.fn(async () => ({ ok: true as const, offerIds: [] })),
  withdraw: vi.fn(async () => ({ ok: true as const, withdrawn: true })),
  decide: vi.fn(async () => ({ ok: true as const })),
})
const WONDER = { total: 3, threshold: 10, options: [], mine: null, myOffers: [], helpers: [] }
const memberPost = (): MemberPost => ({
  id: POST, kind: 'ask', body: 'Anyone seen a red kite?', placeName: 'Levee', saleOn: null, street: null,
  createdAt: '2026-11-10T18:00:00Z', expiresAt: '2026-11-20T18:00:00Z', labels: [], labelsPinned: false,
  displayName: null, avatarUrl: null, mine: false, ended: false, answered: false, answers: null,
})

type Spies = Record<string, ReturnType<typeof vi.fn>>

/** Every write control a visitor can reach, as a visitor or a member sees it. */
function controls(signedIn: boolean, spy: Spies, wonder: WonderActions) {
  return (
    <>
      <HeartButton target={{ postId: POST }} returnTo={RETURN} />
      <SaveButton postId={POST} returnTo={RETURN} />
      <FollowPageButton groupId={PAGE} isPrivate={false} loggedIn={signedIn} following={false} returnTo={RETURN} onFollow={spy.follow as never} onUnfollow={vi.fn()} />
      <RemindMeButton postId={POST} repeats={false} reminderId={null} loggedIn={signedIn} returnTo={RETURN} actions={{ set: spy.remind as never, remove: vi.fn() }} />
      <WonderPanel postId={WONDER_POST} view={WONDER} loggedIn={signedIn} canManage={false} returnTo={RETURN} actions={wonder} />
      <MemberPostView post={memberPost()} loggedIn={signedIn} onAnswer={spy.answer as never} onWithdraw={vi.fn()} onReport={vi.fn()} />
      <ReportControl subjectId={PAGE} subjectLabel="Kite Club" wordsReportable loggedIn={signedIn} returnTo={RETURN} onSend={spy.report as never} />
    </>
  )
}

const TAPS: [string, () => void][] = [
  [`heart:${POST}`, () => fireEvent.click(screen.getByRole('button', { name: 'Heart this post' }))],
  [`save:${POST}`, () => fireEvent.click(screen.getByRole('button', { name: 'Save this post' }))],
  [`get-updates:${PAGE}`, () => fireEvent.click(screen.getByTestId('page-follow-signin'))],
  [`remind:${POST}`, () => fireEvent.click(screen.getByTestId('remind-me-signin'))],
  [`respond:${WONDER_POST}`, () => fireEvent.click(screen.getByTestId('wonder-im-in-signin'))],
  [`respond:${POST}`, () => fireEvent.click(screen.getByTestId('member-post-answer'))],
  [`report:${PAGE}`, () => {
    fireEvent.click(screen.getAllByRole('button', { name: 'More options' }).at(-1)!)
    fireEvent.click(screen.getByText(COPY.reportPageWords))
  }],
]

const freshSpies = (): Spies => ({
  follow: vi.fn(async () => ({ ok: true as const, relationship: 'follower' as const })),
  remind: vi.fn(async () => ({ ok: true as const, reminderId: 'r1' })),
  answer: vi.fn(async () => ({ ok: true as const, on: true })),
  report: vi.fn(async () => ({ ok: true as const })),
})

describe('F134.4 — every write asks first, and completes after sign-in', () => {
  beforeEach(() => window.localStorage.clear())

  // [guards F134.4]
  it('each write control, signed out, asks and saves nothing; back signed in, that one tap completes once, and a link alone never writes', async () => {
    for (const [intent, tap] of TAPS) {
      // Signed out: the tap asks, the sheet carries the intent, and nothing is sent.
      act(() => resetMarks({ signedIn: false }))
      const spy = freshSpies()
      const wonder = wonderActions()
      render(controls(false, spy, wonder))
      tap()
      expectAsked(intent)
      for (const f of [setHeartAction, setSaveAction, spy.follow, spy.remind, spy.answer, spy.report, wonder.join]) expect(f, intent).not.toHaveBeenCalled()
      cleanup()

      // Back signed in on the address the sheet sent: only the tapped control finishes, and the intent leaves.
      act(() => resetMarks({ signedIn: true }))
      comeBack(intent)
      const after = freshSpies()
      const wonderAfter = wonderActions()
      render(controls(true, after, wonderAfter))
      const done = {
        [`heart:${POST}`]: () => expect(setHeartAction).toHaveBeenCalledWith({ postId: POST, on: true }),
        [`save:${POST}`]: () => expect(setSaveAction).toHaveBeenCalledWith({ postId: POST, on: true }),
        [`get-updates:${PAGE}`]: () => expect(after.follow).toHaveBeenCalledWith({ groupId: PAGE }),
        [`remind:${POST}`]: () => expect(after.remind).toHaveBeenCalledWith({ postId: POST, every: false }),
        [`respond:${WONDER_POST}`]: () => expect(wonderAfter.join).toHaveBeenCalledWith({ postId: WONDER_POST, option: null }),
        [`respond:${POST}`]: () => expect(after.answer).toHaveBeenCalledWith(true),
        [`report:${PAGE}`]: () => {
          expect(screen.getByRole('dialog')).toHaveTextContent(COPY.reportPageWordsSubject)
        },
      }[intent]!
      await waitFor(done)
      const calls = [setHeartAction, setSaveAction, after.follow, after.remind, after.answer, wonderAfter.join as ReturnType<typeof vi.fn>].reduce((n, f) => n + f.mock.calls.length, 0)
      expect(calls, intent).toBe(intent.startsWith('report:') ? 0 : 1)
      expect(window.location.search, intent).toBe('')
      cleanup()
      setHeartAction.mockClear()
      setSaveAction.mockClear()

      // The same address again — a reload, or the link forwarded on — finishes nothing: the tap was this browser's, once.
      comeBack(intent)
      const again = freshSpies()
      const wonderAgain = wonderActions()
      render(controls(true, again, wonderAgain))
      await new Promise((r) => setTimeout(r, 20))
      for (const f of [setHeartAction, setSaveAction, again.follow, again.remind, again.answer, wonderAgain.join]) expect(f, `forged ${intent}`).not.toHaveBeenCalled()
      expect(screen.queryByRole('dialog'), `forged ${intent}`).toBeNull()
      cleanup()
    }
  })
})
