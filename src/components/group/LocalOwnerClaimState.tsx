'use client'

// #806 — the owner's Locally Owned claim and the header badge it earns, shared
// so a save updates both from what the save returns. A router refresh after the
// save could be dropped (React kept the update suspended and never woke it), and
// the Page went on showing the claim as it was before.

import { createContext, useContext, useState } from 'react'
import type { LocalOwnerBadge, OwnerClaim } from '@/lib/groups/resolve-shop'

export interface LocalOwnerClaimState {
  claim: OwnerClaim
  badge: LocalOwnerBadge | null
}

const Ctx = createContext<{ state: LocalOwnerClaimState; set: (s: LocalOwnerClaimState) => void } | null>(null)

export function LocalOwnerClaimProvider({ claim, badge, children }: LocalOwnerClaimState & { children: React.ReactNode }) {
  const [state, set] = useState<LocalOwnerClaimState>({ claim, badge })
  // A new render from the server wins over what a save set (React's "adjust state when a prop changes").
  const [from, setFrom] = useState({ claim, badge })
  if (from.claim !== claim || from.badge !== badge) {
    setFrom({ claim, badge })
    set({ claim, badge })
  }
  return <Ctx.Provider value={{ state, set }}>{children}</Ctx.Provider>
}

export function useLocalOwnerClaim() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useLocalOwnerClaim outside LocalOwnerClaimProvider')
  return v
}

export function LocalOwnerBadgeChip() {
  const { badge } = useLocalOwnerClaim().state
  if (!badge) return null
  return (
    <span data-testid="local-owner-badge" className="chip chip-selected whitespace-nowrap text-xs">
      {badge.label}
    </span>
  )
}
