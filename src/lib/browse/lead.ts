// #796 — Explore's first look (ruled A, Don 2026-10-14): only what is new or happening soon — tonight,
// this weekend, last-minute openings, Pages new since the last visit — reshuffled each visit, and
// never something this browser was already shown on an earlier visit. With nothing new it falls back
// to the #557 rotation of Pages. Posts never lead otherwise; they live behind the Updates filter.
import { happeningWindows } from '@/lib/metro/happening'
import type { BrowseResult } from '@/lib/feed/browse-feed'

export const LEAD_SIZE = 6
export const SEEN_COOKIE = 'su_seen'
export const SEEN_COOKIE_MAX_AGE = 60 * 60 * 24 * 30
const SEEN_CAP = 80
const DAY = 24 * 60 * 60 * 1000
const FIRST_VISIT_NEW = 7 * DAY

type Window = { from: string; to: string }

/** 32-bit FNV-1a in base 36: short enough for a cookie, stable for a row. */
function hash(s: string): string {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return (h >>> 0).toString(36)
}

export const leadKey = (r: Pick<BrowseResult, 'resultKind' | 'resultId'>) => hash(`${r.resultKind}:${r.resultId}`)

const KEY = /^[0-9a-z]{1,8}$/
const keys = (s: string | undefined) => (s ? s.split(',').filter((k) => KEY.test(k)) : [])

/**
 * The cookie is `<seed>~<shown this visit>~<shown before>`. What this visit showed only counts as seen
 * once the visit (its seed) is over, so a refresh does not empty the lead it is looking at.
 */
function readSeen(value: string | undefined | null): { seed: string; current: string[]; before: string[] } | null {
  const m = /^([0-9a-z]{1,32})~([0-9a-z,]*)~([0-9a-z,]*)$/.exec(value ?? '')
  return m ? { seed: m[1]!, current: keys(m[2]), before: keys(m[3]) } : null
}

export function seenBefore(value: string | undefined | null, seed: string | null): Set<string> {
  const c = readSeen(value)
  if (!c) return new Set()
  return new Set(c.seed === seed ? c.before : [...c.before, ...c.current])
}

export function recordSeen(value: string | undefined | null, seed: string, shown: readonly string[]): string {
  const c = readSeen(value) ?? { seed, current: [], before: [] }
  const fresh = shown.filter((k) => KEY.test(k))
  const [current, before] = c.seed === seed ? [[...c.current, ...fresh], c.before] : [fresh, [...c.before, ...c.current]]
  const uniq = (a: string[]) => [...new Set(a)]
  const cur = uniq(current).slice(-SEEN_CAP)
  const old = uniq(before).filter((k) => !cur.includes(k)).slice(-(SEEN_CAP - cur.length))
  return `${seed}~${cur.join(',')}~${old.join(',')}`
}

const within = (iso: string | null, w: Window) => Boolean(iso) && iso! >= w.from && iso! < w.to

export interface LeadOptions {
  now: Date
  lastVisit: Date | null
  seen: Set<string>
  seed: string | null
  windows?: { tonight: Window; weekend: Window }
  size?: number
}

export function pickLead(results: readonly BrowseResult[], o: LeadOptions): { lead: BrowseResult[]; fresh: boolean } {
  const size = o.size ?? LEAD_SIZE
  const hw = o.windows ?? (() => {
    const h = happeningWindows(o.now)
    return { tonight: h.today, weekend: h.thisWeekend }
  })()
  const since = (o.lastVisit ?? new Date(o.now.getTime() - FIRST_VISIT_NEW)).toISOString()
  const nowIso = o.now.toISOString()
  const soon: Window = { from: nowIso, to: new Date(o.now.getTime() + 2 * DAY).toISOString() }
  const postedLately = new Date(o.now.getTime() - DAY).toISOString()

  const isNew = (r: BrowseResult) =>
    r.resultKind === 'page'
      ? r.pageCreatedAt > since
      : r.withheld
        ? r.sortAt > since // signed out: a Page that posted since, as its "sign in to see" card (F093.7)
        : within(r.startsAt, hw.tonight) || within(r.startsAt, hw.weekend) || (Boolean(r.postedAt) && r.postedAt! >= postedLately && within(r.startsAt, soon))

  const order = (rows: BrowseResult[]) => {
    const seed = o.seed ?? ''
    return rows
      .map((r) => ({ r, k: hash(`${seed}:${leadKey(r)}`) }))
      .sort((a, b) => parseInt(a.k, 36) - parseInt(b.k, 36))
      .map((x) => x.r)
  }
  const unique = (rows: readonly BrowseResult[]) => [...new Map(rows.map((r) => [leadKey(r), r])).values()]

  const fresh = order(unique(results).filter((r) => isNew(r) && !o.seen.has(leadKey(r))))
  if (fresh.length) return { lead: fresh.slice(0, size), fresh: true }
  return { lead: order(unique(results).filter((r) => r.resultKind === 'page')).slice(0, size), fresh: false }
}
