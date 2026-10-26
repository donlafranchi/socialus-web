// F118 — neighbours open their own town. The board is one cached read of town_board(); every
// surface shows that figure, never one recomputed in answer to the reader's own action (F076 c14).

import type { SupabaseClient } from '@supabase/supabase-js'

export const ROUND_SIZE = 3

export const KIND_LABELS = {
  food: 'Food',
  shops: 'Shops',
  makers: 'Makers',
  services: 'Services',
  groups: 'Groups and events',
} as const
export type MakerKind = keyof typeof KIND_LABELS
export const MAKER_KINDS = Object.keys(KIND_LABELS) as MakerKind[]

export interface TownRow {
  slug: string
  name: string
  place_names: string[]
  maker_goal: number
  supporter_goal: number
  makers: number
  supporters: number
  kinds: Partial<Record<MakerKind, number>>
  ready_at: string | null
  ready_rank: number | null
}

export interface Contributor {
  first_name: string
  brought: number
  added: number
}

export const stillToGo = (have: number, goal: number) => Math.max(0, goal - have)

export const closeness = (t: TownRow) =>
  (Math.min(1, t.makers / t.maker_goal) + Math.min(1, t.supporters / t.supporter_goal)) / 2

export function sortBoard(rows: TownRow[]): TownRow[] {
  return [...rows].sort(
    (a, b) => (a.ready_rank ?? 99) - (b.ready_rank ?? 99) || closeness(b) - closeness(a) || a.name.localeCompare(b.name),
  )
}

export const placesLeft = (rows: TownRow[]) => Math.max(0, ROUND_SIZE - rows.filter((r) => r.ready_rank !== null).length)

const fold = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, ' ').trim()

/** The town a typed name points at: the town itself, a town inside it, or the first that starts with it. */
export function matchTown(rows: TownRow[], typed: string): TownRow | null {
  const q = fold(typed)
  if (!q) return null
  const names = (t: TownRow) => [t.name, t.name.replace(/ County$/, ''), ...t.place_names].map(fold)
  return rows.find((t) => names(t).includes(q)) ?? rows.find((t) => names(t).some((n) => n.startsWith(q))) ?? null
}

const SOCIAL = /(^|\.)(instagram\.com|facebook\.com|tiktok\.com|x\.com|twitter\.com|youtube\.com)$/i
// Not the maker's own: reviews, maps, ticket sellers, link shorteners.
const NOT_OWN =
  /(^|\.)(yelp\.com|tripadvisor\.com|google\.com|goo\.gl|g\.page|maps\.app\.goo\.gl|apple\.com|nextdoor\.com|eventbrite\.com|songkick\.com|bandsintown\.com|seatgeek\.com|stubhub\.com|ticketmaster\.com|bit\.ly|linktr\.ee|doordash\.com|ubereats\.com|grubhub\.com)$/i

export type MakerLink = { ok: true; url: string } | { ok: false }

/** The maker's own website or a social profile (seeder rule: own site or socials only). */
export function makerLink(raw: string): MakerLink {
  const typed = raw.trim()
  if (!typed) return { ok: false }
  let u: URL
  try {
    u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(typed) ? typed : `https://${typed}`)
  } catch {
    return { ok: false }
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return { ok: false }
  const host = u.hostname.toLowerCase()
  if (!host.includes('.') || NOT_OWN.test(host)) return { ok: false }
  if (SOCIAL.test(host) && u.pathname.replace(/\/+$/, '') === '') return { ok: false }
  const path = u.pathname.replace(/\/+$/, '')
  return { ok: true, url: `https://${host}${path}${u.search}` }
}

type Reader = Pick<SupabaseClient, 'rpc'>

export async function readBoard(supabase: Reader): Promise<TownRow[]> {
  const { data, error } = await supabase.rpc('town_board')
  if (error || !data) return []
  return sortBoard(data as TownRow[])
}

export async function readContributors(supabase: Reader, slug: string): Promise<Contributor[]> {
  const { data, error } = await supabase.rpc('town_contributors', { p_slug: slug })
  return error || !data ? [] : (data as Contributor[])
}
