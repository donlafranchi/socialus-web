// #299 — the art a card shows when there is no photo: one of PersonMark's
// four neutral tones, chosen by the Page's id so it never changes, and the
// kind's icon. No new colours (Don, 2026-10-01), and no emoji.

import { Store, Wrench, Users } from 'lucide-react'
import { TONE_CLASS, toneFor } from '@/components/PersonMark'

export type ArtKind = 'shop' | 'service' | 'group'

const ICON = { shop: Store, service: Wrench, group: Users } as const

/** A business sells; a practice serves; every other kind gathers people. */
export function artKindFor(groupKind: string | null | undefined): ArtKind {
  if (groupKind === 'business') return 'shop'
  if (groupKind === 'practice') return 'service'
  return 'group'
}

export function DefaultArt({ seed, kind }: { seed: string; kind: ArtKind }) {
  const Icon = ICON[kind]
  return (
    <div
      data-testid="default-art"
      data-kind={kind}
      aria-hidden="true"
      className={`flex h-full w-full items-center justify-center ${TONE_CLASS[toneFor(seed)]}`}
    >
      <Icon size={40} strokeWidth={1.5} />
    </div>
  )
}
