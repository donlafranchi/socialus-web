'use client'

// F134.4 — every write asks first, and the tap completes after sign-in (deferred registration, 2026-09-18).
//
// Signed out, `ask(fn)` opens the sign-in sheet and runs nothing: no save is sent and none is attempted, so a
// control cannot "save and then ask". The sheet's link carries `intent=<action>:<target>` back through sign-in.
//
// THE ADDRESS ALONE NEVER FINISHES A TAP. A link anyone can send would otherwise make a write a member never made
// (answer a neighbour post, say "I'm in", follow) — review of #1278. So, like OAuth's `state`, the tap is also
// written to this browser's localStorage when the sheet opens (localStorage, not sessionStorage: a magic link opens
// in a new tab), and on the way back the one control whose action and target match BOTH the address and that fresh
// record runs `onReturn` once. The record is cleared and the intent taken off the address either way, so a forged
// link only strips its own parameter, and a sign-in finished in another browser simply doesn't finish the tap.
//
// The boundary is still the server and the database: every handler refuses a signed-out caller and `anon` holds no
// write privilege (F134.5). This is the courtesy that makes the refusal a question instead of a dead end.

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { SignInPrompt } from '@/components/auth/SignInPrompt'
import { parseIntent, type GatedAction } from '@/lib/auth/requires-account'

const here = () => (typeof window === 'undefined' ? '/' : window.location.pathname + window.location.search)

/** Where the asked-for tap waits through sign-in, and how long it stays good. */
export const PENDING_TAP_KEY = 'su:pending-tap'
export const PENDING_TAP_MAX_MS = 30 * 60 * 1000

interface PendingTap {
  intent: string
  at: number
  /** What the control needs to finish the same tap (e.g. which report was picked). */
  extra: string | null
}

function readPending(): PendingTap | null {
  try {
    const raw = window.localStorage.getItem(PENDING_TAP_KEY)
    const v = raw ? (JSON.parse(raw) as PendingTap) : null
    return v && typeof v.intent === 'string' && typeof v.at === 'number' ? v : null
  } catch {
    return null
  }
}

export function useSignInFirst({
  action,
  target = null,
  signedIn,
  returnTo,
  onReturn,
}: {
  action: GatedAction
  target?: string | null
  /** Undefined while the session is still being read: nothing runs and nothing asks. */
  signedIn: boolean | undefined
  returnTo?: string | null
  /** What the tap does, run once when the visitor comes back signed in, with what `ask` was given to keep. */
  onReturn?: (extra: string | null) => void
}): { ask: (fn: () => void, extra?: string | null) => void; prompt: () => void; sheet: ReactNode } {
  const [asking, setAsking] = useState(false)
  const done = useRef(false)
  const finish = useRef(onReturn)
  useEffect(() => {
    finish.current = onReturn
  })

  useEffect(() => {
    if (signedIn !== true || done.current || !finish.current) return
    const url = new URL(window.location.href)
    const intent = parseIntent(url.searchParams.get('intent'))
    if (!intent || intent.action !== action || intent.target !== (target ?? null)) return
    done.current = true
    url.searchParams.delete('intent')
    window.history.replaceState(window.history.state, '', url.toString())
    const pending = readPending()
    const raw = intent.target ? `${intent.action}:${intent.target}` : intent.action
    window.localStorage.removeItem(PENDING_TAP_KEY)
    // Only a tap this browser asked for, recently: anything else is a link, and a link never writes.
    if (!pending || pending.intent !== raw || Date.now() - pending.at > PENDING_TAP_MAX_MS) return
    finish.current(pending.extra)
  }, [signedIn, action, target])

  const remember = useCallback(
    (extra: string | null) => {
      const tap: PendingTap = { intent: target ? `${action}:${target}` : action, at: Date.now(), extra }
      try {
        window.localStorage.setItem(PENDING_TAP_KEY, JSON.stringify(tap))
      } catch {
        // Storage refused (private mode, full): the sheet still asks; the tap just won't finish on its own.
      }
    },
    [action, target],
  )

  const ask = useCallback(
    (fn: () => void, extra: string | null = null) => {
      if (signedIn === undefined) return
      if (signedIn) return fn()
      remember(extra)
      setAsking(true)
    },
    [signedIn, remember],
  )

  const sheet = asking ? (
    <SignInPrompt action={action} target={target} currentPath={returnTo ?? here()} onClose={() => setAsking(false)} />
  ) : null
  // A session that ended mid-visit: the server said signed out, so ask now, whatever the page thought.
  const prompt = useCallback(() => {
    remember(null)
    setAsking(true)
  }, [remember])
  return { ask, prompt, sheet }
}
