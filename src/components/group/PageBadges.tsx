'use client'

// #371 — badges, launch scope (ruled 2026-10-05): up to three under the kind
// line, the rest behind "+N more" (design language: long lists collapse). Each
// opens what it means and that the owner says it; nothing is verified today.
// Navy chip, gold mark (Anodised: gold only on navy). Precedent: Google
// Business Profile attributes, Yelp's owner-reported attributes.

import { useState } from 'react'
import { Award } from 'lucide-react'
import { Sheet } from '@/components/ui/Sheet'
import type { ShownBadge } from '@/lib/groups/badges'

const SHOWN = 3

export function PageBadges({ badges }: { badges: ShownBadge[] }) {
  const [all, setAll] = useState(false)
  const [open, setOpen] = useState<ShownBadge | null>(null)
  if (badges.length === 0) return null
  const visible = all ? badges : badges.slice(0, SHOWN)
  return (
    <div data-testid="page-badges" className="flex flex-wrap items-center gap-x-1.5">
      {visible.map((b) => (
        <button
          key={b.key}
          type="button"
          aria-label={b.says}
          data-testid={b.key === 'locally_owned' ? 'local-owner-badge' : `badge-${b.key}`}
          onClick={() => setOpen(b)}
          className="press inline-flex min-h-tap items-center"
        >
          <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-[var(--color-frame)] px-3 text-[13px] font-semibold text-white">
            <Award size={14} className="text-[var(--color-highlight-soft)]" aria-hidden="true" />
            {b.label}
          </span>
        </button>
      ))}
      {!all && badges.length > SHOWN && (
        <button type="button" onClick={() => setAll(true)} className="press min-h-tap px-2 text-[13px] font-medium text-[var(--color-accent)]">
          +{badges.length - SHOWN} more
        </button>
      )}
      {open && (
        <Sheet open title={open.label} onClose={() => setOpen(null)} testId="badge-sheet">
          <div className="flex flex-col gap-2 text-body-sm text-[var(--color-fg)]">
            <p>{open.meaning}</p>
            <p className="text-[var(--color-fg-muted)]">
              {open.source === 'registration' ? 'Based on the business registration they gave us.' : "The owner says this. SocialUs hasn't checked it."}
            </p>
          </div>
        </Sheet>
      )}
    </div>
  )
}
