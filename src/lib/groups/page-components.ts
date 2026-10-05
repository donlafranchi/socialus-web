import { pageKindOf } from './page-kind'

// Don, 2026-10-04: hours and a business phone are a component of a Page,
// on by default where they apply (shops, services) and off for groups until
// the owner adds them. Kept in groups.metadata.components; no column.

export type ComponentKey = 'contact'

const DEFAULT_ON: Record<ComponentKey, readonly string[]> = { contact: ['business'] }

export function componentOn(kind: string, metadata: unknown, key: ComponentKey): boolean {
  const set = (metadata as { components?: Record<string, unknown> } | null)?.components?.[key]
  return typeof set === 'boolean' ? set : DEFAULT_ON[key].includes(kind)
}

/** Don, 2026-10-05: Locally Owned is a business thing (shops and services);
 *  social groups never show the badge or its question. */
export const isBusinessKind = (kind: string) => pageKindOf(kind) === 'business'
