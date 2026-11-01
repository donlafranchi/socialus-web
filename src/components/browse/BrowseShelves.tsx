'use client'

// Result groups as shelves (ShelfRow), and the one that is open as its own screen. The open shelf is in the
// address (?shelf=), so the phone's back gesture closes it and a shared link reopens it.

import { useCallback, useRef, useSyncExternalStore } from 'react'
import { BrowseResultCard } from './BrowseResultCard'
import { ShelfRow, ShelfScreen } from './ShelfRow'
import { LoggedShelf } from './ShelfLogging'
import type { BrowseResult } from '@/lib/feed/browse-feed'
import type { ResultGroup } from '@/lib/browse/groups'

const keyOf = (r: BrowseResult) => `${r.resultKind}:${r.resultId}`
const shelfInUrl = () => new URL(window.location.href).searchParams.get('shelf')

// The address is the store: Back fires popstate; our own pushState and replaceState tell the listeners.
const listeners = new Set<() => void>()
const changed = () => listeners.forEach((l) => l())
function subscribe(l: () => void) {
  listeners.add(l)
  window.addEventListener('popstate', l)
  return () => {
    listeners.delete(l)
    window.removeEventListener('popstate', l)
  }
}

/** `prefetch`: how many cards at the start of the first shelf read their Page ahead of the tap (#555). */
export function BrowseShelves({ groups, prefetch = 0 }: { groups: readonly ResultGroup[]; prefetch?: number }) {
  const open = useSyncExternalStore(subscribe, shelfInUrl, () => null)
  const pushed = useRef(false)

  const show = useCallback((key: string) => {
    const u = new URL(window.location.href)
    u.searchParams.set('shelf', key)
    window.history.pushState(window.history.state, '', u.toString())
    pushed.current = true
    changed()
  }, [])
  const close = useCallback(() => {
    // Opened here: step back, so Back and the close button agree. Arrived on the link: drop the shelf in place.
    if (pushed.current) {
      pushed.current = false
      window.history.back()
      return
    }
    const u = new URL(window.location.href)
    u.searchParams.delete('shelf')
    window.history.replaceState(window.history.state, '', u.toString())
    changed()
  }, [])

  const current = groups.find((g) => g.key === open)
  return (
    <>
      {groups.map((g, n) => {
        const row = (
          <ShelfRow
            key={g.key}
            title={g.label}
            items={g.results}
            keyOf={keyOf}
            renderItem={(r, i) => <BrowseResultCard result={r} as="div" prefetch={n === 0 && i < prefetch ? true : undefined} />}
            onSeeAll={() => show(g.key)}
          />
        )
        return g.logId ? (
          <LoggedShelf key={g.key} logId={g.logId}>
            {row}
          </LoggedShelf>
        ) : (
          row
        )
      })}
      {current && <ShelfScreen title={current.label} items={current.results} keyOf={keyOf} renderItem={(r) => <BrowseResultCard result={r} as="div" />} onClose={close} />}
    </>
  )
}
