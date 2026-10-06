// T159 (Issue #61) — the reporter's identity is not readable by the reported
// party. Asserted against a real Postgres through RLS, as a browser client.
//
// Why this test exists, and why it is not a file-shape assertion.
//
// T159 writes `group.reported` to `group_events` with `acting_member_id` = the
// reporter. `group_events` carries a policy — `group_events_select_member_of_group`
// — that lets any explicit member of a Group read that Group's events, and the
// Page owner is an explicit member from the moment `group.create` runs. So the
// specced event write, on the schema as it shipped in #65, hands the reported
// party the member id of the person who reported them.
//
// Both halves of F058 forbid that outcome in terms:
//   scenario F058 acceptance 2 — "A submitted report changes nothing visible to
//     anyone, including the reported party."
//   Issue #62 — "A reporter whose identity leaks to the reported party is a
//     member-harm failure, not a polish bug."
//
// So the three F058 event kinds are excluded from the member-readable policy.
// This test is the proof, and it is a real read through RLS rather than a grep
// of the migration, because the thing being asserted is what a browser gets
// back — not what the DDL says.

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Pool, type PoolClient } from 'pg'
import { requireRunnable } from './support/runnable'

const DATABASE_URL =
  process.env.DATABASE_URL ??
  process.env.POSTGRES_URL_NON_POOLING ??
  process.env.POSTGRES_URL

const RUNNABLE = requireRunnable({
  claim:
    'the member a report is about cannot read who reported them, through the browser client',
  available: !!DATABASE_URL,
  remedy:
    'run `supabase start`, then put DATABASE_URL in .env.test.local ' +
    '(recipe in .env.local.example)',
})

const OWNER = 'aaaaaaaa-0000-4000-8000-00000000f058'
const REPORTER = 'bbbbbbbb-0000-4000-8000-00000000f058'
const OUTSIDER = 'cccccccc-0000-4000-8000-00000000f058'
// A third party who acts on the Page but is not the owner — see the control row.
const ACTOR = 'eeeeeeee-0000-4000-8000-00000000f058'
const GROUP = 'dddddddd-0000-4000-8000-00000000f058'

let pool: Pool

// Everything is created inside one transaction that is rolled back, so the
// suite leaves no rows behind and needs no cleanup path of its own.
let client: PoolClient

beforeAll(async () => {
  if (!RUNNABLE) return
  pool = new Pool({ connectionString: DATABASE_URL })
  client = await pool.connect()
  await client.query('begin')

  for (const [id, handle] of [
    [OWNER, 'f058-owner'],
    [REPORTER, 'f058-reporter'],
    [OUTSIDER, 'f058-outsider'],
    [ACTOR, 'f058-actor'],
  ]) {
    await client.query(
      `insert into auth.users
         (id, instance_id, aud, role, email, encrypted_password,
          email_confirmed_at, created_at, updated_at)
       values ($1, '00000000-0000-0000-0000-000000000000', 'authenticated',
               'authenticated', $2, 'x', now(), now(), now())`,
      [id, `${handle}@test.invalid`],
    )
    await client.query(
      `insert into public.members (id, handle, display_name, created_at)
       values ($1, $2, $3, now())`,
      [id, handle, handle],
    )
  }

  await client.query(
    `insert into public.groups (id, kind, name, slug, lifecycle_state, founder_member_id, photo_url)
     values ($1,'group', 'F058 Probe Page', 'f058-probe-page', 'active', $2,
             'https://cdn.test.invalid/photo.jpg')`,
    [GROUP, OWNER],
  )
  await client.query(
    `insert into public.group_memberships (group_id, member_id, role, source)
     values ($1, $2, 'steward', 'explicit')`,
    [GROUP, OWNER],
  )

  // An ordinary event kind, as a control: the policy must still let a member
  // read their Group's normal history. Without this row, a change that closed
  // the policy outright would pass every assertion below.
  //
  // Its acting member is deliberately NOT the owner. `group_events` also
  // carries `group_events_select_acting_self` (acting_member_id = auth.uid()),
  // so a control row the owner acted on would come back through that policy
  // even with the member-of-group policy dropped entirely — and the control
  // would assert nothing. Attributing it to a third party who is in neither
  // role makes the member-of-group policy the only way the owner can see it,
  // and leaves the outsider a genuine outsider.
  await client.query(
    `insert into public.group_events
       (group_id, event_kind, payload, acting_member_id, created_at)
     values ($1, 'group.activated', '{}'::jsonb, $2, now())`,
    [GROUP, ACTOR],
  )

  // Exactly what report.create writes.
  for (const kind of ['group.reported', 'group.photo_hidden']) {
    await client.query(
      `insert into public.group_events
         (group_id, event_kind, payload, acting_member_id, created_at)
       values ($1, $2, '{}'::jsonb, $3, now())`,
      [GROUP, kind, REPORTER],
    )
  }
})

afterAll(async () => {
  if (!RUNNABLE) return
  await client.query('rollback')
  client.release()
  await pool.end()
})

/** Read group_events as a given signed-in member, through RLS. */
async function readEventsAs(memberId: string) {
  await client.query(`set local role authenticated`)
  await client.query(`select set_config('request.jwt.claims', $1, true)`, [
    JSON.stringify({ sub: memberId, role: 'authenticated' }),
  ])
  const { rows } = await client.query<{ event_kind: string; acting_member_id: string }>(
    `select event_kind, acting_member_id
       from public.group_events
      where group_id = $1
      order by event_kind`,
    [GROUP],
  )
  await client.query(`set local role postgres`)
  return rows
}

describe.skipIf(!RUNNABLE)('F058 — the reported party cannot see who reported them', () => {
  it('the Page owner reads back no group.reported row at all', async () => {
    const rows = await readEventsAs(OWNER)
    expect(rows.map((r) => r.event_kind)).not.toContain('group.reported')
  })

  it('the Page owner reads back no group.photo_hidden row either', async () => {
    // The hide event carries the reporter as acting member just as the report
    // event does, so it is the same leak by another name.
    const rows = await readEventsAs(OWNER)
    expect(rows.map((r) => r.event_kind)).not.toContain('group.photo_hidden')
  })

  it("the reporter's member id appears in nothing the owner can read", async () => {
    const rows = await readEventsAs(OWNER)
    expect(rows.map((r) => r.acting_member_id)).not.toContain(REPORTER)
  })

  it('an ordinary event kind is still readable by the Page\'s members', async () => {
    // The control. The policy narrowed to three kinds; it did not close.
    const rows = await readEventsAs(OWNER)
    expect(rows.map((r) => r.event_kind)).toContain('group.activated')
  })

  it('a member who is not in the Group reads nothing either', async () => {
    const rows = await readEventsAs(OUTSIDER)
    expect(rows).toEqual([])
  })

  it('the operator, reading server-side as the table owner, still sees both rows', async () => {
    // RLS is bypassed for the table owner, which is how the operator surface
    // (T122) reads the queue. The events must remain intact for that.
    const { rows } = await client.query<{ event_kind: string }>(
      `select event_kind from public.group_events
        where group_id = $1 and event_kind in ('group.reported','group.photo_hidden')`,
      [GROUP],
    )
    expect(rows).toHaveLength(2)
  })
})
