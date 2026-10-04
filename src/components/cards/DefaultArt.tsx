// #299 — the art a card shows when there is no photo: its kind's icon on one
// of PersonMark's light tones. Per kind, the same for every Page of that kind
// (Don, 2026-10-01, which replaced art derived from a Page's id). No new
// colours, and no emoji.

import { Store, Wrench, Users } from 'lucide-react'
import { TONE_CLASS } from '@/components/PersonMark'

export type ArtKind = 'shop' | 'service' | 'group'

const ICON = { shop: Store, service: Wrench, group: Users } as const
const TONE = { shop: TONE_CLASS.a, service: TONE_CLASS.a, group: TONE_CLASS.a } as const

/** A business sells; a practice serves; every other kind gathers people.
 *  Unknown (the signed-out withheld read carries no kind) draws no icon. */
export function artKindFor(groupKind: string | null | undefined): ArtKind | null {
  if (!groupKind) return null
  if (groupKind === 'business') return 'shop'
  if (groupKind === 'practice') return 'service'
  return 'group'
}

export function DefaultArt({ kind }: { kind: ArtKind | null }) {
  const Icon = kind ? ICON[kind] : null
  return (
    <div
      data-testid="default-art"
      data-kind={kind ?? undefined}
      aria-hidden="true"
      className={`flex h-full w-full items-center justify-center ${kind ? TONE[kind] : TONE_CLASS.a}`}
    >
      {Icon && <Icon size={40} strokeWidth={1.5} />}
    </div>
  )
}
