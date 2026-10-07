#!/usr/bin/env tsx
// #388 — builder content, all at once, for the "Builder content" workflow
// (the GitHub iOS app: Actions → Builder content → Run workflow).
//
//   tsx scripts/builder-content.ts status   the switch, and how many Pages and Posts
//   tsx scripts/builder-content.ts hide     builder content hidden from members
//   tsx scripts/builder-content.ts show     shown again
//   tsx scripts/builder-content.ts delete   every row a builder made, and their photo files
//
// Runs the same SQL as /admin/builders. Needs DATABASE_URL; delete also needs
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, because photo files go through
// the Storage API. The builder accounts themselves are never removed.

import { createClient } from '@supabase/supabase-js'
import { Client } from 'pg'

const need = (name: string) => {
  const v = process.env[name]?.trim()
  if (!v) throw new Error(`${name} is not set`)
  return v
}

async function status(db: Client) {
  const { rows } = await db.query(
    `select c.visible, c.changed_at,
            (select count(*)::int from public.groups g join public.builders b on b.member_id = g.founder_member_id) as pages,
            (select count(*)::int from public.page_posts p join public.groups g on g.id = p.group_id
               join public.builders b on b.member_id = g.founder_member_id where p.dissolved_at is null) as posts
       from public.builder_content c`,
  )
  const r = rows[0]
  console.log(`Builder content: ${r.visible ? 'SHOWING to members' : 'HIDDEN from members'} (since ${r.changed_at.toISOString()})`)
  console.log(`${r.pages} Pages, ${r.posts} Posts`)
}

async function removePhotos(db: Client): Promise<number> {
  const supabase = createClient(need('SUPABASE_URL'), need('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { rows } = await db.query<{ member_id: string }>(`select member_id from public.builders`)
  let removed = 0
  for (const { member_id } of rows) {
    for (;;) {
      const { data, error } = await supabase.storage.from('media').list(member_id, { limit: 100 })
      if (error) throw error
      if (!data?.length) break
      const { error: rmError } = await supabase.storage.from('media').remove(data.map((f) => `${member_id}/${f.name}`))
      if (rmError) throw rmError
      removed += data.length
    }
  }
  return removed
}

async function main() {
  const action = process.argv[2]
  if (!['status', 'hide', 'show', 'delete'].includes(action ?? '')) {
    throw new Error('usage: builder-content.ts status|hide|show|delete')
  }
  const db = new Client({ connectionString: need('DATABASE_URL') })
  await db.connect()
  try {
    if (action === 'hide' || action === 'show') {
      await db.query(`update public.builder_content set visible = $1, changed_at = now(), changed_by = null`, [action === 'show'])
    } else if (action === 'delete') {
      const { rows } = await db.query(`select public.delete_builder_content() as deleted`)
      console.log('Deleted:', JSON.stringify(rows[0].deleted))
      console.log(`Photo files removed: ${await removePhotos(db)}`)
    }
    await status(db)
  } finally {
    await db.end()
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
