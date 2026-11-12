// F134 criterion 4 — every write asks first: signed out, heart, save, get updates, join, Remind me, "I'm in", a
// neighbour post's answer and report each open the sign-in sheet and save nothing; back from sign-in, the tap
// completes once. A control that saves and then asks fails this (the spy would have been called).
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

const POST = '00000000-0000-4000-8000-0000000f1340'
const PAGE = '00000000-0000-4000-8000-0000000f1341'
const RETURN = '/g/kite-club'

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

describe('F134.4 — every write asks first, and completes after sign-in', () => {
  // [guards F134.4]
  it('heart, save, get updates, Remind me, "I\'m in", an answer and report: signed out each asks and saves nothing', async () => {
    act(() => resetMarks({ signedIn: false }))
    const follow = vi.fn()
    const remind = vi.fn()
    const report = vi.fn()
    const answer = vi.fn()
    const wonder = wonderActions()
    render(
      <>
        <HeartButton target={{ postId: POST }} returnTo={RETURN} />
        <SaveButton postId={POST} returnTo={RETURN} />
        <FollowPageButton groupId={PAGE} isPrivate={false} loggedIn={false} following={false} returnTo={RETURN} onFollow={follow} onUnfollow={vi.fn()} />
        <RemindMeButton postId={POST} repeats={false} reminderId={null} loggedIn={false} returnTo={RETURN} actions={{ set: remind, remove: vi.fn() }} />
        <WonderPanel postId={POST} view={WONDER} loggedIn={false} canManage={false} returnTo={RETURN} actions={wonder} />
        <MemberPostView post={memberPost()} loggedIn={false} onAnswer={answer} onWithdraw={vi.fn()} onReport={vi.fn()} />
        <ReportControl subjectId={PAGE} subjectLabel="Kite Club" itemLabel="Report this Page" loggedIn={false} returnTo={RETURN} onSend={report} />
      </>,
    )
    const taps: [() => HTMLElement, string][] = [
      [() => screen.getByRole('button', { name: 'Heart this post' }), `heart:${POST}`],
      [() => screen.getByRole('button', { name: 'Save this post' }), `save:${POST}`],
      [() => screen.getByTestId('page-follow-signin'), `get-updates:${PAGE}`],
      [() => screen.getByTestId('remind-me-signin'), `remind:${POST}`],
      [() => screen.getByTestId('wonder-im-in-signin'), `respond:${POST}`],
      [() => screen.getByTestId('member-post-answer'), `respond:${POST}`],
    ]
    for (const [control, intent] of taps) {
      fireEvent.click(control())
      expectAsked(intent)
      fireEvent.click(screen.getByTestId('sign-in-prompt-dismiss'))
    }
    fireEvent.click(screen.getAllByRole('button', { name: 'More options' }).at(-1)!)
    fireEvent.click(screen.getByText('Report this Page'))
    expectAsked(`report:${PAGE}`)

    for (const spy of [setHeartAction, setSaveAction, follow, remind, report, answer, wonder.join]) expect(spy).not.toHaveBeenCalled()
  })

  // [guards F134.4]
  it('back signed in, the tap completes once, only on what was tapped, and the intent leaves the address', async () => {
    act(() => resetMarks({ signedIn: true }))
    comeBack(`heart:${POST}`)
    render(
      <>
        <HeartButton target={{ postId: POST }} returnTo={RETURN} />
        <HeartButton target={{ postId: PAGE }} returnTo={RETURN} />
        <SaveButton postId={POST} returnTo={RETURN} />
      </>,
    )
    await waitFor(() => expect(setHeartAction).toHaveBeenCalledWith({ postId: POST, on: true }))
    expect(setHeartAction).toHaveBeenCalledTimes(1)
    expect(setSaveAction).not.toHaveBeenCalled()
    expect(window.location.search).toBe('')
    cleanup()

    const follow = vi.fn(async () => ({ ok: true as const, relationship: 'follower' as const }))
    comeBack(`get-updates:${PAGE}`)
    render(<FollowPageButton groupId={PAGE} isPrivate={false} loggedIn following={false} returnTo={RETURN} onFollow={follow} onUnfollow={vi.fn()} />)
    await waitFor(() => expect(follow).toHaveBeenCalledWith({ groupId: PAGE }))
    cleanup()

    const remind = vi.fn(async () => ({ ok: true as const, reminderId: 'r1' }))
    comeBack(`remind:${POST}`)
    render(<RemindMeButton postId={POST} repeats={false} reminderId={null} loggedIn returnTo={RETURN} actions={{ set: remind, remove: vi.fn() }} />)
    await waitFor(() => expect(remind).toHaveBeenCalledWith({ postId: POST, every: false }))
    cleanup()

    const wonder = wonderActions()
    comeBack(`respond:${POST}`)
    render(<WonderPanel postId={POST} view={WONDER} loggedIn canManage={false} returnTo={RETURN} actions={wonder} />)
    await waitFor(() => expect(wonder.join).toHaveBeenCalledWith({ postId: POST, option: null }))
    cleanup()

    comeBack(`report:${PAGE}`)
    render(<ReportControl subjectId={PAGE} subjectLabel="Kite Club" itemLabel="Report this Page" loggedIn returnTo={RETURN} onSend={vi.fn()} />)
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
  })
})
