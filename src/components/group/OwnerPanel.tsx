// #300 — L08: the owner's tools beside the real Page from 1024 (on a phone
// they are the owner bar). Never a separate manage view.

import { Megaphone } from 'lucide-react'
import { EditToggle } from './edit/PageEditor'
import { Button } from '@/components/ui/Button'
import { ANNOUNCE_ANCHOR } from './announce-anchor'

export function OwnerPanel({ pagePath }: { pagePath: string }) {
  return (
    <div className="rounded-lg border border-[var(--color-border)] p-4">
      <h2 className="text-title-3 text-[var(--color-fg)]">Your Page</h2>
      <p className="mt-1 text-caption text-[var(--color-fg-muted)]">Only you see this.</p>
      <div className="mt-4 flex flex-col gap-2">
        {/* Secondary: the composer's own Post is the screen's one primary. */}
        <Button href={`${pagePath}#${ANNOUNCE_ANCHOR}`} variant="secondary">
          <Megaphone size={16} aria-hidden="true" />
          New post
        </Button>
        {/* #302 — edit in place, by section (Don, 2026-10-04). */}
        <EditToggle />
      </div>
    </div>
  )
}
