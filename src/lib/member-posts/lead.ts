// #1183 — a member post's lead line: its kind, when, and its neighborhood ("LOST & FOUND · 2 DAYS AGO · CURTIS
// PARK", per plan #270 § 4). A yard sale gives its day instead. Draft words.

import { KIND_LABEL, type MemberPostKind } from './kinds'
import { METRO_TIME_ZONE } from '@/lib/metro/metro-time'
import { metroDate } from '@/lib/metro/metro-week'

const DAY_MS = 86_400_000

export function postedAgo(createdAt: string, now: Date): string {
  const days = Math.round((Date.parse(metroDate(now, METRO_TIME_ZONE)) - Date.parse(metroDate(new Date(createdAt), METRO_TIME_ZONE))) / DAY_MS)
  return days <= 0 ? 'Today' : days === 1 ? 'Yesterday' : `${days} days ago`
}

export function saleDay(saleOn: string): string {
  return new Date(`${saleOn}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })
}

export function memberPostLead(p: { kind: MemberPostKind; createdAt: string; saleOn: string | null; placeName: string }, now: Date): string {
  return [KIND_LABEL[p.kind], p.saleOn ? saleDay(p.saleOn) : postedAgo(p.createdAt, now), p.placeName].join(' · ')
}
