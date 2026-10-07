'use client'

// What the owner sees on their own Page, and nobody else does.
//
// Don, 2026-09-18: opening their page should open another surface where these
// things can be changed and where their tools become available.
//
// SERVER-SIDE, NOT A HIDDEN BUTTON. `viewerOwnsPage` is resolved on the server
// and this component is not rendered at all for anyone else — the markup is
// absent, not display:none. And the boundary is not this component: every write
// behind it re-checks the managing role in the handler, so a direct call from
// someone who found the URL is refused regardless of what rendered.
//
// It sits at the top of the Page rather than in the ⋯ menu. The owner's own
// Page is the one place these belong in plain sight; burying "edit" in an
// overflow menu is how Don came to say there was no way to edit a Page.

import Link from 'next/link'
import { Megaphone } from 'lucide-react'
import { ANNOUNCE_ANCHOR } from './announce-anchor'
import { PencilButton } from '@/components/ui/PencilButton'

export function OwnerBar({ pagePath }: { pagePath: string }) {
  // Issue #175 — the owner surface is a CHILD of the Page now.
  //
  // It was `/manage/<slug>`, a parallel top-level route, only because the old
  // address lived under a catch-all and Next.js refuses a static segment after
  // one. The canonical address is a single dynamic segment, so the edit
  // surface hangs off the Page it edits, which is where it belongs.
  return (
    <div data-testid="owner-bar" className="flex flex-col gap-2 rounded-md bg-[var(--color-surface)] p-3">
      <span className="text-xs font-medium text-[var(--color-fg-muted)]">Your Page — only you see this</span>
      {/* Both tools on one row, so neither wraps loose under the label. */}
      <div className="flex items-center gap-2">
        <Link href={`${pagePath}#${ANNOUNCE_ANCHOR}`} data-testid="owner-announce" className="btn-primary press flex-1">
          <Megaphone size={14} className="reacts mr-1.5" aria-hidden="true" />
          Announce
        </Link>
        {/* #456 — the PM, 2026-10-06: one primary; Edit is the pencil, to the Edit Page's cards. */}
        <PencilButton href={`${pagePath}/edit`} label="Edit Page" testId="owner-edit" />
      </div>
    </div>
  )
}
