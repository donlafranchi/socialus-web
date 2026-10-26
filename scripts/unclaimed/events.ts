#!/usr/bin/env tsx
// #997 (Don, 2026-10-22) — each venue Page's real shows, read daily from the venue's OWN events page or feed (never an
// aggregator), posted as dated posts for the next 60 days; over, cancelled and dropped shows come off.
//
//   tsx scripts/unclaimed/events.ts            reads every venue and prints what it found (writes nothing)
//   tsx scripts/unclaimed/events.ts --apply    posts them; needs DATABASE_URL
//   --only <name fragment>                     one venue
// With --apply it also needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY: each show gets its own picture (#1045).
//
// Idempotent (one post per venue + night + title). Polite: robots.txt is obeyed, one request at a time, 3 s apart.
// A venue whose page fails or reads no shows is listed in $BROKEN_FILE so the workflow files an Issue; its posts stay.
import { appendFileSync, writeFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { Client } from 'pg'
import { getWithRetries, HTML_FOLLOW, remindVenueFollowers, parseShows, robotsAllows, syncVenueShows, upcoming, SHOWS_AHEAD_DAYS, type VenueShow } from '../../src/lib/unclaimed/venue-events'
import { eventPhoto } from '../../src/lib/unclaimed/event-photo'
import { uploadPhotos } from '../../src/lib/unclaimed/upload'
import type { PlannedPage } from '../../src/lib/unclaimed/plan'
import { readPlanned } from './rows'

const summary = (line: string) => {
  console.log(line)
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, line + '\n')
}
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms))
const robotsCache = new Map<string, string>()

const pageCache = new Map<string, Promise<string>>()
/** One request per address per run (Harlow's and the Starlet Room share a list). */
const get = (url: string) => (pageCache.get(url) ?? pageCache.set(url, fetchPage(url)).get(url)!)

const fetchPage = (url: string) => getWithRetries(url, fetch, pause)

async function allowed(url: string): Promise<boolean> {
  const u = new URL(url)
  if (!robotsCache.has(u.origin)) robotsCache.set(u.origin, await get(`${u.origin}/robots.txt`).catch(() => ''))
  return robotsAllows(robotsCache.get(u.origin)!, u.pathname + u.search)
}

/** Seconds the site asks between requests (Crawl-delay), at least 1, at most 15. */
const crawlDelay = (url: string) => Math.min(15, Math.max(1, Number(/crawl-delay:\s*(\d+)/i.exec(robotsCache.get(new URL(url).origin) ?? '')?.[1] ?? 1))) * 1000

/** Everything the venue lists. The Events Calendar's API pages; the others are one document. */
async function read(p: PlannedPage, now: Date): Promise<VenueShow[]> {
  const src = p.events!
  if (!(await allowed(src.url))) throw new Error(`robots.txt disallows ${src.url}`)
  if (src.format !== 'tribe') {
    const body = await get(src.url)
    const follow = (src.format === 'html' && src.parser && HTML_FOLLOW[src.parser]?.(body, src.url, now)) || []
    const pages: Record<string, string> = {}
    // A follow page that will not load costs only its own shows; the venue is broken only when nothing reads.
    for (const url of follow.slice(0, 12)) {
      await pause(crawlDelay(url))
      try {
        if (await allowed(url)) pages[url] = await get(url)
      } catch {
        // skipped
      }
    }
    return parseShows(src, body, now, pages)
  }
  const until = new Date(now.getTime() + SHOWS_AHEAD_DAYS * 86400_000).toISOString().slice(0, 10)
  let next: string | undefined = `${src.url}${src.url.includes('?') ? '&' : '?'}per_page=50&start_date=${now.toISOString().slice(0, 10)}&end_date=${until}`
  const shows: VenueShow[] = []
  for (let i = 0; next && i < 6; i++) {
    const body = JSON.parse(await get(next)) as { next_rest_url?: string }
    shows.push(...parseShows(src, JSON.stringify(body)))
    next = body.next_rest_url
    if (next) await pause(1000)
  }
  return shows
}

async function main() {
  const apply = process.argv.includes('--apply')
  const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1]!.toLowerCase() : null
  const venues = readPlanned().listed.filter((p) => p.events && (!only || p.name.toLowerCase().includes(only)))
  const now = new Date()
  const db = apply ? new Client({ connectionString: process.env.DATABASE_URL }) : null
  if (db) {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set')
    await db.connect()
  }
  const need = (k: string) => process.env[k] ?? (() => { throw new Error(`${k} is not set`) })()
  const storage = db ? createClient(need('SUPABASE_URL'), need('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } }) : null
  const broken: { name: string; url: string; error: string }[] = []
  const total = { venues: 0, listed: 0, added: 0, updated: 0, removed: 0, kept: 0, reminders: 0 }
  try {
    for (const [i, p] of venues.entries()) {
      if (i) await pause(3000)
      const source = p.events!.page ?? p.events!.url
      let shows: VenueShow[]
      try {
        shows = await read(p, now)
        if (!shows.length) throw new Error('no shows read: the page may have changed shape')
      } catch (e) {
        broken.push({ name: p.name, url: p.events!.url, error: e instanceof Error ? e.message : String(e) })
        summary(`BROKEN ${p.name}: ${broken.at(-1)!.error} (${p.events!.url})`)
        continue
      }
      const ahead = upcoming(shows, now)
      total.venues++
      total.listed += ahead.length
      if (!db) {
        summary(`${p.name}: ${shows.length} read, ${ahead.length} in the next ${SHOWS_AHEAD_DAYS} days${ahead[0] ? `; next: ${ahead[0].title} ${ahead[0].startsAt.toISOString()}` : ''}`)
        continue
      }
      const { rows } = await db.query(
        `select id, slug, photo_url from public.groups where unclaimed_at is not null and claimed_at is null and unclaimed_hidden_at is null
            and public_info_url = any($1::text[]) limit 1`,
        [[p.publicInfoUrl, ...(p.legacyUrl ? [p.legacyUrl] : [])]],
      )
      const g = rows[0] as { id: string; slug: string; photo_url: string | null } | undefined
      if (!g) {
        summary(`${p.name}: no unclaimed Page (not loaded yet, claimed, or removed); skipped`)
        continue
      }
      await db.query('begin')
      try {
        const interests = (await db.query(`select t.label from public.page_tags pt join public.tags t on t.id = pt.tag_id where pt.group_id = $1`, [g.id])).rows.map((r) => r.label as string)
        const photoFor = async (show: VenueShow, key: string, type: Parameters<typeof eventPhoto>[0]['type']) => {
          // The venue's own image is read politely (robots.txt, the crawl delay); a game's is never read at all.
          let own = type !== 'sports' ? show.imageUrl : undefined
          if (own && !(await allowed(own).catch(() => false))) own = undefined
          if (own) await pause(crawlDelay(own))
          try {
            return await eventPhoto({ show: { ...show, imageUrl: own }, type, venue: p.name, key, upload: async (ph) => (await uploadPhotos(storage!, g.slug, [ph]))[0]! })
          } catch (e) {
            summary(`${p.name}: no picture for "${show.title}": ${e instanceof Error ? e.message : e}`)
            return null
          }
        }
        const t = await syncVenueShows(db, g.id, p.name, source, shows, g.photo_url, now, { venueInterests: interests, photoFor })
        const r = await remindVenueFollowers(db, g.id, now)
        await db.query('commit')
        for (const k of ['added', 'updated', 'removed', 'kept'] as const) total[k] += t[k]
        total.reminders += r
        summary(`${p.name}: ${ahead.length} upcoming; added ${t.added}, updated ${t.updated}, removed ${t.removed}, unchanged ${t.kept}${r ? `, ${r} reminders` : ''}`)
      } catch (e) {
        await db.query('rollback').catch(() => {})
        broken.push({ name: p.name, url: p.events!.url, error: `posting failed: ${e instanceof Error ? e.message : e}` })
        summary(`BROKEN ${p.name}: ${broken.at(-1)!.error}`)
      }
    }
  } finally {
    await db?.end()
  }
  summary(`Venues read ${total.venues} of ${venues.length}; shows ahead ${total.listed}; added ${total.added}, updated ${total.updated}, removed ${total.removed}, unchanged ${total.kept}; reminders added ${total.reminders}; broken ${broken.length}`)
  if (process.env.BROKEN_FILE) writeFileSync(process.env.BROKEN_FILE, JSON.stringify(broken, null, 1))
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
