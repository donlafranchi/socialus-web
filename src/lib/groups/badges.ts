// #371 — badges, launch scope (ruled 2026-10-05): the kind facts. Each is the
// owner's own claim and reads "Says …"; nothing is verified today (2026-10-01).
// Locally owned is the exception in source, not wording: it comes from the
// business registration (page_local_owner_badge) and is for businesses only.
// Stored in groups.metadata.badges, beside metadata.components.

import { pageKindOf } from './page-kind'

export type BadgeKey = 'family_owned' | 'since' | 'coop' | 'nonprofit' | 'free_to_join' | 'everyone_welcome'
export type Badges = Partial<Record<Exclude<BadgeKey, 'since'>, true>> & { since?: number }

export interface ShownBadge {
  key: BadgeKey | 'locally_owned'
  label: string
  says: string
  meaning: string
  source: 'owner' | 'registration'
}

const FACTS: Record<Exclude<BadgeKey, 'since'>, { label: string; meaning: string }> = {
  family_owned: { label: 'Family-owned', meaning: 'Owned and run by a family.' },
  coop: { label: 'Owned by its workers or members', meaning: 'A co-op, or owned by the people who work there.' },
  nonprofit: { label: 'Nonprofit', meaning: 'Run as a nonprofit, not for profit.' },
  free_to_join: { label: 'Free to join', meaning: 'Anyone can join without paying.' },
  everyone_welcome: { label: 'Everyone welcome', meaning: 'Open to people of any background, age or ability.' },
}

export const BADGE_LABEL: Record<BadgeKey, string> = { ...Object.fromEntries(Object.entries(FACTS).map(([k, v]) => [k, v.label])), since: 'Since' } as Record<BadgeKey, string>
export const BADGE_MEANING: Record<BadgeKey, string> = { ...Object.fromEntries(Object.entries(FACTS).map(([k, v]) => [k, v.meaning])), since: 'The year it started.' } as Record<BadgeKey, string>

const ORDER: BadgeKey[] = ['family_owned', 'since', 'coop', 'nonprofit', 'free_to_join', 'everyone_welcome']
const FIRST: Record<'business' | 'group', BadgeKey[]> = {
  business: ['family_owned', 'since', 'coop', 'everyone_welcome'],
  group: ['since', 'free_to_join', 'everyone_welcome'],
}

export const sinceMax = () => new Date().getFullYear()

export function parseBadges(metadata: unknown): Badges {
  const raw = (metadata as { badges?: Record<string, unknown> } | null)?.badges
  if (!raw || typeof raw !== 'object') return {}
  const out: Badges = {}
  for (const k of ORDER) {
    if (k === 'since') {
      const y = raw.since
      if (Number.isInteger(y) && (y as number) >= 1800 && (y as number) <= sinceMax()) out.since = y as number
    } else if (raw[k] === true) out[k] = true
  }
  return out
}

/** The badges a Page shows, Locally owned first. */
export function pageBadges(stored: string, badges: Badges, localOwner: boolean): ShownBadge[] {
  const social = pageKindOf(stored) === 'group'
  const out: ShownBadge[] = []
  if (!social && localOwner)
    out.push({ key: 'locally_owned', label: 'Locally owned', says: 'Says locally owned', meaning: 'Owned by people whose business is registered in the Sacramento area.', source: 'registration' })
  for (const k of ORDER) {
    if (k === 'since') {
      if (!badges.since) continue
      const label = `${social ? 'Meeting since' : 'Since'} ${badges.since}`
      out.push({ key: k, label, says: `Says ${label.charAt(0).toLowerCase()}${label.slice(1)}`, meaning: BADGE_MEANING.since, source: 'owner' })
    } else if (badges[k]) {
      out.push({ key: k, label: FACTS[k].label, says: `Says ${FACTS[k].label.toLowerCase()}`, meaning: FACTS[k].meaning, source: 'owner' })
    }
  }
  return out
}

/** What the owner's Badges sheet offers: the ones that fit the type, then the rest. */
export function offeredBadges(stored: string): { first: BadgeKey[]; more: BadgeKey[] } {
  const first = FIRST[pageKindOf(stored)]
  return { first, more: ORDER.filter((k) => !first.includes(k)) }
}
