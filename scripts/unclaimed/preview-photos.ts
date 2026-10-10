#!/usr/bin/env tsx
// #556 — what the loader would attach, without a database: gathers the photos for every planned
// Page and writes contact sheets, so a person can look before anything is written.
//   tsx scripts/unclaimed/preview-photos.ts <outdir> [limit]
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'
import { gatherPhotos } from '../../src/lib/unclaimed/photos'
import { readPlanned } from './rows'

async function main() {
  const out = process.argv[2] ?? 'photo-preview'
  const limit = Number(process.argv[3] ?? '1000')
  mkdirSync(out, { recursive: true })
  const { listed } = readPlanned()
  const pages = listed.slice(0, limit)
  const seen: Record<string, number> = {}
  const slots = new Map(pages.map((p) => [p.slug, (seen[p.pool] = (seen[p.pool] ?? -1) + 1)]))
  const results: { name: string; own: number; total: number; phone: string | null; down: boolean; cells: Buffer[] }[] = []
  let next = 0
  await Promise.all(
    Array.from({ length: 5 }, async () => {
      while (next < pages.length) {
        const p = pages[next++]!
        const g = await gatherPhotos({ name: p.name, slug: p.slug, site: p.publicInfoUrl, pool: p.pool, slot: slots.get(p.slug) })
        const cells = await Promise.all(g.photos.map((x, i) => sharp(x.data).resize(i === 0 ? 300 : 150, i === 0 ? 200 : 100, { fit: 'cover' }).jpeg({ quality: 70 }).toBuffer()))
        results.push({ name: p.name, own: g.ownCount, total: g.photos.length, phone: g.meta.phone, down: g.siteDown, cells })
        console.log(`${p.name}: own ${g.ownCount}, total ${g.photos.length}${g.siteDown ? ', SITE DOWN' : ''}${g.meta.phone ? `, ${g.meta.phone}` : ''}`)
      }
    }),
  )
  results.sort((a, b) => a.name.localeCompare(b.name))
  writeFileSync(join(out, 'summary.json'), JSON.stringify(results.map((r) => ({ name: r.name, own: r.own, total: r.total, phone: r.phone, down: r.down })), null, 1))
  const rowH = 206
  for (let s = 0; s < results.length; s += 10) {
    const batch = results.slice(s, s + 10)
    const comps: sharp.OverlayOptions[] = []
    for (const [r, res] of batch.entries()) {
      const label = Buffer.from(`<svg width="300" height="200"><rect width="300" height="22" fill="#000a"/><text x="4" y="16" font-size="13" fill="#fff" font-family="sans-serif">${s + r} ${res.name.replace(/[&<]/g, '').slice(0, 34)} (${res.own} own)</text></svg>`)
      res.cells.forEach((c, i) => comps.push({ input: c, left: i === 0 ? 0 : 304 + (i - 1) * 154, top: r * rowH }))
      comps.push({ input: label, left: 0, top: r * rowH })
    }
    await sharp({ create: { width: 304 + 3 * 154, height: batch.length * rowH, channels: 3, background: '#222' } }).composite(comps).jpeg({ quality: 78 }).toFile(join(out, `sheet-${String(s / 10).padStart(2, '0')}.jpg`))
  }
}
main().catch((e) => { console.error(e); process.exit(1) })
