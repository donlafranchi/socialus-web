#!/usr/bin/env tsx
// #556 — every website and social link of every planned Page, checked. Exits 1 on a broken one.
import { checkLinks } from '../../src/lib/unclaimed/links'
import { readPlanned } from './rows'

async function main() {
  const { listed } = readPlanned()
  const urls = listed.flatMap((p) => [p.publicInfoUrl, ...Object.values(p.social ?? {})])
  const res = await checkLinks(urls)
  const bad = res.filter((r) => !r.ok)
  for (const r of res) if (!r.ok || /robots/.test(r.note)) console.log(`${r.ok ? 'blocked-for-robots' : 'BROKEN'} ${r.url} (${r.note})`)
  console.log(`${res.length} links, ${bad.length} broken`)
  process.exit(bad.length ? 1 : 0)
}
main()
