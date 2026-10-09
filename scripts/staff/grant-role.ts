#!/usr/bin/env tsx
// #544 — grant or revoke a staff role until the /admin/staff screen exists.
//
//   tsx scripts/staff/grant-role.ts grant  <member-id> <role> [granted-by-member-id]
//   tsx scripts/staff/grant-role.ts revoke <member-id> <role>
//   tsx scripts/staff/grant-role.ts list
//
// Roles: owner, moderator, analyst, support (staff_roles). Needs DATABASE_URL.
// Idempotent: granting a role already held changes nothing; revoking keeps the row as the record.
import { Client } from 'pg'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function main() {
  const [cmd, member, role, by] = process.argv.slice(2)
  const url = process.env.DATABASE_URL?.trim()
  if (!url) throw new Error('DATABASE_URL is not set')
  const db = new Client({ connectionString: url })
  await db.connect()
  try {
    if (cmd === 'list') {
      const { rows } = await db.query(
        `select a.member_id, a.role, a.granted_at, a.revoked_at from public.staff_assignments a order by a.granted_at`,
      )
      for (const r of rows) console.log(`${r.member_id}  ${r.role}${r.revoked_at ? '  (revoked)' : ''}`)
      console.log(`${rows.filter((r) => !r.revoked_at).length} live assignments`)
      return
    }
    if (!['grant', 'revoke'].includes(cmd ?? '') || !member || !UUID.test(member) || !role) {
      throw new Error('usage: grant-role.ts grant|revoke <member-uuid> <role> | list')
    }
    const known = await db.query(`select 1 from public.staff_roles where role = $1`, [role])
    if (!known.rows.length) throw new Error(`no such role: ${role}`)
    if (cmd === 'grant') {
      const r = await db.query(
        `insert into public.staff_assignments (member_id, role, granted_by) values ($1, $2, $3) on conflict (member_id, role) where revoked_at is null do nothing returning id`,
        [member, role, by && UUID.test(by) ? by : null],
      )
      console.log(r.rows.length ? `Granted ${role} to ${member}` : `${member} already holds ${role}`)
    } else {
      const r = await db.query(`update public.staff_assignments set revoked_at = now() where member_id = $1 and role = $2 and revoked_at is null returning id`, [member, role])
      console.log(r.rows.length ? `Revoked ${role} from ${member}` : `${member} does not hold ${role}`)
    }
  } finally {
    await db.end()
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
