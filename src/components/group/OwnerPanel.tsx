// #300 — L08: the owner's tools beside the real Page from 1024 (on a phone
// they are the owner bar). Never a separate manage view.

import { Megaphone } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { ANNOUNCE_ANCHOR } from './announce-anchor'
import { PencilButton } from '@/components/ui/PencilButton'

export function OwnerPanel({ pagePath }: { pagePath: string }) {
  return (
    <div className="rounded-lg border border-[var(--color-border)] p-4">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-title-3 text-[var(--color-fg)]">Your Page</h2>
          <p className="mt-1 text-caption text-[var(--color-fg-muted)]">Only you see this.</p>
        </div>
        {/* #456 — the PM, 2026-10-06: Edit is the pencil, in the header like the Edit cards. */}
        <PencilButton href={`${pagePath}/edit`} label="Edit Page" testId="owner-edit" className="-mr-2 -mt-2" />
      </header>
      <div className="mt-4 flex flex-col gap-2">
        {/* #456 — Announce is the owner's one primary. */}
        <Button href={`${pagePath}#${ANNOUNCE_ANCHOR}`}>
          <Megaphone size={16} aria-hidden="true" />
          Announce
        </Button>
      </div>
    </div>
  )
}
