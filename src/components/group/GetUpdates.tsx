'use client'

// #1171 (socialus-plan #269, Don 2026-11-02) — Follow becomes "Get updates", a quiet option in the Page's ⋯ menu
// (Facebook keeps Follow in a Page's ⋯ the same way). Same rows, same handlers, same notifications: only the word and
// the place change. The provider holds the state so the ⋯ item and what shows while getting updates agree.

import { createContext, useContext, useState, type ReactNode } from 'react'
import { ReportControl } from './ReportControl'
import { SignInPrompt } from '@/components/auth/SignInPrompt'
import { Toast } from '@/components/Toast'
import { HEART_COPY } from '@/lib/copy'

type FollowFn = (input: { groupId: string }) => Promise<unknown>

interface State {
  following: boolean
  toggle: () => Promise<void>
}

const Ctx = createContext<State | null>(null)

export function GetUpdatesProvider(props: Props) {
  return props.enabled ? <Provider {...props} /> : <>{props.children}</>
}

interface Props {
  /** Off for a Page the viewer runs, belongs to, or joins rather than follows: no Get updates there. */
  enabled: boolean
  groupId: string
  name: string
  following: boolean
  loggedIn: boolean
  returnTo?: string
  onFollow: FollowFn
  onUnfollow: FollowFn
  children: ReactNode
}

function Provider({
  groupId,
  name,
  following: initial,
  loggedIn,
  returnTo,
  onFollow,
  onUnfollow,
  children,
}: Props) {
  const [following, setFollowing] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [asking, setAsking] = useState(false)
  const [told, setTold] = useState<string | null>(null)
  const toggle = async () => {
    if (!loggedIn) return setAsking(true)
    if (busy) return
    setBusy(true)
    const next = !following
    try {
      await (next ? onFollow : onUnfollow)({ groupId })
      setFollowing(next)
      setTold(next ? HEART_COPY.gettingUpdates(name) : HEART_COPY.updatesStopped(name))
    } catch {
      setTold('That did not go through. Mind trying again?')
    } finally {
      setBusy(false)
    }
  }
  return (
    <Ctx.Provider value={{ following, toggle }}>
      {children}
      {asking && <SignInPrompt action="get-updates" currentPath={returnTo ?? '/'} onClose={() => setAsking(false)} />}
      <Toast message={told ?? ''} visible={told !== null} onHide={() => setTold(null)} />
    </Ctx.Provider>
  )
}

/** The Page's ⋯: Get updates (or Stop updates) first, then Report. */
export function PageMenu(props: React.ComponentProps<typeof ReportControl>) {
  const state = useContext(Ctx)
  const lead = state ? [{ label: state.following ? HEART_COPY.stopUpdates : HEART_COPY.getUpdates, onSelect: () => void state.toggle(), testId: 'page-get-updates', shelfSave: !state.following }] : []
  return <ReportControl {...props} leadItems={lead} />
}

/** Shown only while the viewer gets this Page's updates (e.g. Remind me every time, #945). */
export function WhenGettingUpdates({ children }: { children: ReactNode }) {
  const state = useContext(Ctx)
  return state?.following ? <>{children}</> : null
}
