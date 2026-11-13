#!/usr/bin/env tsx
// #1227 Feature flags of our own.
//
//   tsx scripts/flags.ts check                     every flag, where the code reads it, and any
//                                                  past its removal date (no database)
//   tsx scripts/flags.ts list                      the same, with who each is on for (needs DATABASE_URL)
//   tsx scripts/flags.ts set <flag> <audience>     off, builders or everyone (needs DATABASE_URL)
//
// Production runs list and set through the "Feature flags" workflow.
import { Client } from 'pg'
import { FLAGS, AUDIENCES, type Audience } from '../src/lib/flags/registry'
import { report } from './flags-references'

const [command, flag, audience] = process.argv.slice(2)

async function withDb<T>(fn: (db: Client) => Promise<T>): Promise<T> {
  const url = process.env.DATABASE_URL?.trim()
  if (!url) throw new Error('DATABASE_URL is not set')
  const db = new Client({ connectionString: url })
  await db.connect()
  try {
    return await fn(db)
  } finally {
    await db.end()
  }
}

function print(audiences?: Map<string, string>) {
  const r = report()
  const keys = Object.keys(FLAGS) as (keyof typeof FLAGS)[]
  if (keys.length === 0) console.log('No flags declared.')
  for (const key of keys) {
    const d = FLAGS[key] as { hides: string; issue: number; removeBy: string }
    const where = r.references.filter((x) => x.key === key).map((x) => `${x.file}:${x.line}`)
    const on = audiences ? ` · on for ${audiences.get(key) ?? 'builders (no row)'}` : ''
    const due = r.pastDue.some((p) => p.key === key) ? ' · PAST ITS REMOVAL DATE' : ''
    console.log(`${key}: ${d.hides} (#${d.issue}) · remove by ${d.removeBy}${on}${due}`)
    for (const w of where) console.log(`    read at ${w}`)
  }
  for (const u of r.undeclared) console.log(`NOT DECLARED: ${u.key ?? '(not a literal key)'} at ${u.file}:${u.line}`)
  for (const k of r.unread) console.log(`DECLARED BUT NEVER READ: ${k}`)
  for (const k of r.badDates) console.log(`NOT A DATE: removeBy of ${k}`)
  if (r.pastDue.length) console.log(`${r.pastDue.length} flag(s) past their removal date.`)
  return r.undeclared.length + r.unread.length + r.badDates.length
}

async function main() {
  if (command === 'check') {
    process.exitCode = print() > 0 ? 1 : 0
  } else if (command === 'list') {
    const rows = await withDb(async (db) => (await db.query<{ key: string; audience: string }>(
      'select key, audience from public.feature_flags order by key')).rows)
    process.exitCode = print(new Map(rows.map((r) => [r.key, r.audience]))) > 0 ? 1 : 0
  } else if (command === 'set') {
    if (!flag || !(flag in FLAGS)) throw new Error(`No flag called "${flag ?? ''}". Declared: ${Object.keys(FLAGS).join(', ') || 'none'}`)
    if (!AUDIENCES.includes(audience as Audience)) throw new Error(`Audience must be one of ${AUDIENCES.join(', ')}`)
    await withDb((db) => db.query(
      `insert into public.feature_flags (key, audience) values ($1, $2)
       on conflict (key) do update set audience = excluded.audience, updated_at = now()`,
      [flag, audience]))
    console.log(`${flag} is now set to ${audience}.`)
  } else {
    console.error('Usage: flags.ts check | list | set <flag> <off|builders|everyone>')
    process.exitCode = 2
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exitCode = 1
})
