#!/usr/bin/env tsx
// #517, #556 — put the researched local businesses on Explore as unclaimed Pages, each with a cover
// photo and gallery pictures, sample posts, and links that work.
//
//   tsx scripts/unclaimed/load.ts            what it would do (writes nothing; checks every link)
//   tsx scripts/unclaimed/load.ts --apply    do it; needs DATABASE_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//
// Idempotent: a Page that exists (visible, or hidden by a removal request) is not created again, and
// only what it lacks is added. The lists are scripts/unclaimed/makers*.json and listings.json (see
// rows.ts). A broken website, or a Page that ends up without its pictures or that does not open,
// fails the run.
import { createClient } from '@supabase/supabase-js'
import { Client } from 'pg'
import { appendFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { checkLink, checkLinks } from '../../src/lib/unclaimed/links'
import { enrichPage, loadUnclaimed, PHOTOS_PER_PAGE, type Enrichment } from '../../src/lib/unclaimed/load'
import { gatherPhotos } from '../../src/lib/unclaimed/photos'
import { uploadPhotos } from '../../src/lib/unclaimed/upload'
import type { PlannedPage } from '../../src/lib/unclaimed/plan'
import { readLinkAllow, readPlanned } from './rows'

const need = (name: string) => {
  const v = process.env[name]?.trim()
  if (!v) throw new Error(`${name} is not set`)
  return v
}
const BASE = (process.env.APP_BASE_URL ?? 'https://www.socialus.org').replace(/\/$/, '')
const summary = (line: string) => {
  console.log(line)
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, line + '\n')
}

async function main() {
  const { listed, removed, skipped, files } = readPlanned()
  const allow = new Set(readLinkAllow())
  const overrides = JSON.parse(readFileSync(join(__dirname, 'photo-overrides.json'), 'utf8')) as { stockCover: string[] }
  console.log(`Read ${files.join(', ')}: ${listed.length} to list, ${skipped.length} held back`)
  for (const s of skipped) console.log(`  held back: ${s.name} (${s.reason})`)

  // Every website, before anything is written. A broken one is a failure, not a Page to hide.
  const sites = await checkLinks(listed.map((p) => p.publicInfoUrl))
  // A hand-checked address that only fails from here at the network level (refused, timed out) is let through; a 404 never is.
  const excused = (i: number) => allow.has(listed[i]!.publicInfoUrl) && sites[i]!.status === null
  const dead = listed.filter((_, i) => !sites[i]!.ok && !excused(i))
  for (const [i, p] of listed.entries()) if (!sites[i]!.ok && !excused(i)) console.log(`  BROKEN website ${p.name}: ${p.publicInfoUrl} (${sites[i]!.note})`)
  summary(`${listed.length} Pages planned, ${removed.length} removed for a dead address, ${dead.length} with a broken website`)
  if (!process.argv.includes('--apply')) {
    console.log('Dry run: nothing written. Add --apply to write.')
    process.exitCode = dead.length ? 1 : 0
    return
  }
  if (dead.length) throw new Error(`${dead.length} broken website link(s): fix scripts/unclaimed/link-fixes.json or the list`)

  const dbUrl = need('DATABASE_URL')
  const supabase = createClient(need('SUPABASE_URL'), need('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } })
  const now = new Date()
  const slots = new Map<string, number>()
  const seen: Record<string, number> = {}
  for (const p of listed) slots.set(p.slug, (seen[p.pool] = (seen[p.pool] ?? -1) + 1))

  // A business with no working address is taken off Explore, not left linking nowhere. Only an operator restores it (#353).
  {
    const db = new Client({ connectionString: dbUrl })
    await db.connect()
    try {
      for (const p of removed) {
        const r = await db.query(`update public.groups set unclaimed_hidden_at = now() where unclaimed_at is not null and unclaimed_hidden_at is null and public_info_url = $1`, [p.publicInfoUrl])
        if (r.rowCount) summary(`Removed ${p.name}: its address does not work (${p.publicInfoUrl})`)
      }
    } finally {
      await db.end()
    }
  }

  const failed: { name: string; error: string }[] = []
  const tally = { created: 0, existing: 0, enriched: 0, refreshed: 0, complete: 0 }
  const ownCover: string[] = []
  const stockCover: string[] = []

  const gatherFor = (p: PlannedPage) => async (): Promise<Enrichment> => {
    const site = p.legacyUrl ?? p.publicInfoUrl
    const g = await gatherPhotos({ name: p.name, slug: p.slug, site, pool: p.pool, want: PHOTOS_PER_PAGE, slot: slots.get(p.slug), stockCover: overrides.stockCover.includes(p.name) })
    const photos = await uploadPhotos(supabase, p.slug, g.photos)
    const social: Record<string, string> = {}
    for (const [k, url] of Object.entries({ ...g.meta.social, ...(p.social ?? {}) })) {
      if ((await checkLink(url)).ok) social[k] = url
      else console.log(`  dropped broken ${k} link for ${p.name}: ${url}`)
    }
    ;(photos[0]?.own ? ownCover : stockCover).push(p.name)
    return { photos, phone: g.meta.phone, social, siteUrl: site }
  }

  let next = 0
  await Promise.all(
    Array.from({ length: 3 }, async () => {
      const db = new Client({ connectionString: dbUrl })
      await db.connect()
      try {
        while (next < listed.length) {
          const p = listed[next++]!
          try {
            // Creation files a Page under the address it was first listed at; enrichment then moves it to a fixed one.
            const made = await loadUnclaimed(db, [{ ...p, publicInfoUrl: p.legacyUrl ?? p.publicInfoUrl }])
            if (made.failed.length) throw new Error(made.failed[0]!.error)
            tally.created += made.created
            tally.existing += made.existing
            const r = await enrichPage(db, p, gatherFor(p), now)
            if (r === 'missing') throw new Error('the Page is not in the database after loading')
            tally[r]++
            console.log(`${p.name}: ${made.created ? 'created, ' : ''}${r}`)
          } catch (e) {
            failed.push({ name: p.name, error: e instanceof Error ? e.message : String(e) })
            console.log(`  FAILED ${p.name}: ${failed.at(-1)!.error}`)
          }
        }
      } finally {
        await db.end()
      }
    }),
  )

  // Then look at what is live: every Page opens, every picture loads.
  const db = new Client({ connectionString: dbUrl })
  await db.connect()
  try {
    const { rows } = await db.query(
      `select g.name, g.public_id, g.photo_url, g.public_info_url,
              coalesce(array_agg(p.photo_url) filter (where p.sample_kind is not null), '{}') as post_photos,
              count(p.id) filter (where p.sample_kind is not null)::int as samples
         from public.groups g left join public.page_posts p on p.group_id = g.id
        where g.unclaimed_at is not null and g.unclaimed_hidden_at is null and g.public_info_url = any($1::text[])
        group by g.id`,
      [listed.map((p) => p.publicInfoUrl)],
    )
    const checks = await checkLinks(rows.flatMap((r) => [`${BASE}/g/${r.public_id}`, r.photo_url as string, ...(r.post_photos as string[])].filter(Boolean)), fetch, 8)
    const bad = new Map(checks.filter((c) => !c.ok).map((c) => [c.url, c]))
    for (const r of rows) {
      const urls = [`${BASE}/g/${r.public_id}`, r.photo_url as string | null, ...(r.post_photos as string[])]
      for (const u of urls) if (u && bad.has(u)) failed.push({ name: r.name, error: `broken link ${u} (${bad.get(u)!.note})` })
      if (!r.photo_url) failed.push({ name: r.name, error: 'no cover photo' })
      if (r.samples < 3 || (r.post_photos as string[]).filter(Boolean).length < 3) failed.push({ name: r.name, error: `only ${r.samples} sample posts with pictures` })
    }
    summary(`${rows.length} live Pages checked`)
  } finally {
    await db.end()
  }

  summary(`Created ${tally.created}, already there ${tally.existing}; enriched ${tally.enriched}, refreshed ${tally.refreshed}, complete ${tally.complete}`)
  summary(`Covers: ${ownCover.length} the business's own photo, ${stockCover.length} stock`)
  for (const f of failed) summary(`FAILED ${f.name}: ${f.error}`)
  if (failed.length) process.exitCode = 1
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
