// #300 — L08: the owner's tools beside the real Page from 1024 (on a phone
// they are the owner bar). Never a separate manage view.

import { Pencil, Megaphone } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { ANNOUNCE_ANCHOR } from './announce-anchor'

export function OwnerPanel({ pagePath }: { pagePath: string }) {
  return (
    <div className="rounded-lg border border-[var(--color-border)] p-4">
      <h2 className="text-title-3 text-[var(--color-fg)]">Your Page</h2>
      <p className="mt-1 text-caption text-[var(--color-fg-muted)]">Only you see this.</p>
      <div className="mt-4 flex flex-col gap-2">
        <Button href={`${pagePath}#${ANNOUNCE_ANCHOR}`}>
          <Megaphone size={16} aria-hidden="true" />
          Announce
        </Button>
        <Button href={`${pagePath}/edit`} variant="secondary">
          <Pencil size={16} aria-hidden="true" />
          Edit
        </Button>
      </div>
    </div>
  )
}
