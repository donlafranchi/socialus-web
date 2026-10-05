// #299 — the art a card shows when there is no photo: its kind's icon in gold
// on the navy frame (the design language's default-art rule, in the Anodised
// palette). Per kind, the same for every Page of that kind (Don, 2026-10-01,
// which replaced art derived from a Page's id). No emoji.

import { Store, Wrench, Users } from 'lucide-react'

export type ArtKind = 'shop' | 'service' | 'group'

const ICON = { shop: Store, service: Wrench, group: Users } as const
const TILE = 'bg-[var(--color-frame)] text-[var(--color-highlight-soft)]'

/** #363 — a business sells or serves (its use case says which); a group gathers.
 *  Unknown (the signed-out withheld read carries no kind) draws no icon. */
export function artKindFor(groupKind: string | null | undefined, useCase?: string | null): ArtKind | null {
  if (!groupKind) return null
  if (groupKind !== 'business') return 'group'
  return useCase === 'service' ? 'service' : 'shop'
}

export function DefaultArt({ kind }: { kind: ArtKind | null }) {
  const Icon = kind ? ICON[kind] : null
  return (
    <div
      data-testid="default-art"
      data-kind={kind ?? undefined}
      aria-hidden="true"
      className={`flex h-full w-full items-center justify-center ${TILE}`}
    >
      {Icon && <Icon size={40} strokeWidth={1.5} />}
    </div>
  )
}
