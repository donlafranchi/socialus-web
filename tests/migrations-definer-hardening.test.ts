import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

// Issue #36 — Supabase security advisor hardening.
// Static-shape guards over 041_definer_hardening.sql, plus a repo-wide
// regression guard that no function ships without a pinned search_path.
// DB-touching behavior needs a running Supabase (T075/T103 precedent — no
// Docker in this build env), so these assert the SQL text.

const MIG = resolve(__dirname, '..', 'supabase', 'migrations')
const stripComments = (s: string) =>
  s.split('\n').map((l) => l.replace(/--.*$/, '')).join('\n')

// Split in two when the migration history was reconciled (2026-09-11): the
// work was applied to production as two statements under separate versions,
// so the files match what actually ran. Part one pins search_path, part two
// revokes EXECUTE. Assertions follow the seam.
const pinFile = resolve(MIG, '20260911161048_definer_hardening_search_path.sql')
const revokeFile = resolve(MIG, '20260911161136_definer_hardening_revoke_execute.sql')
const pinSql = stripComments(readFileSync(pinFile, 'utf8'))
const revokeSql = stripComments(readFileSync(revokeFile, 'utf8'))
const sql = `${pinSql}\n${revokeSql}`

// The 14 functions the advisor flagged as function_search_path_mutable.
const PINNED = [
  'update_updated_at_column',
  'groups_default_discoverability',
  'places_set_ancestor_state_id',
  'resolve_home_metro',
  'ensure_member_events_partition',
  'ensure_location_events_partition',
  'ensure_group_events_partition',
  'ensure_item_events_partition',
  'ensure_place_events_partition',
  'rotate_member_events_partitions',
  'rotate_location_events_partitions',
  'rotate_group_events_partitions',
  'rotate_item_events_partitions',
  'rotate_place_events_partitions',
] as const

// Trigger-only SECURITY DEFINER functions with no client caller.
const REVOKED = [
  'handle_new_auth_user',
  'create_member_privacy_defaults',
  'assert_member_id_in_auth_users',
  'sync_area_centroid',
  'refresh_discoverable_items_on_publish',
] as const

describe('issue #36 — definer hardening (two files)', () => {
  it('both halves exist', () => {
    expect(existsSync(pinFile)).toBe(true)
    expect(existsSync(revokeFile)).toBe(true)
  })

  it.each(PINNED)('re-creates %s with a pinned search_path', (fn) => {
    const def = sql.match(
      new RegExp(`create or replace function\\s+public\\.${fn}\\s*\\([\\s\\S]*?\\$\\$;`, 'i'),
    )
    expect(def, `${fn} is not re-created in this migration`).not.toBeNull()
    expect(def![0]).toMatch(/set search_path\s*=/i)
  })

  it('pins the PostGIS caller to the extensions-aware path', () => {
    const def = sql.match(
      /create or replace function\s+public\.resolve_home_metro[\s\S]*?\$\$;/i,
    )
    expect(def![0]).toMatch(/set search_path\s*=\s*public\s*,\s*extensions/i)
  })

  it.each(REVOKED)('revokes execute on %s from public, anon and authenticated', (fn) => {
    expect(sql).toMatch(
      new RegExp(
        `revoke all on function\\s+public\\.${fn}\\(\\)\\s+from\\s+public\\s*,\\s*anon\\s*,\\s*authenticated`,
        'i',
      ),
    )
  })

  // 035_partition_rls.sql's whole point: a partition does not inherit the
  // parent's rowsecurity flag, so the helper must enable RLS at creation.
  // Re-creating these functions here must not drop that line.
  it.each([
    'ensure_member_events_partition',
    'ensure_location_events_partition',
    'ensure_group_events_partition',
    'ensure_item_events_partition',
    'ensure_place_events_partition',
  ])('%s still enables RLS on the partition it creates', (fn) => {
    const def = sql.match(
      new RegExp(`create or replace function\\s+public\\.${fn}\\s*\\([\\s\\S]*?\\$\\$;`, 'i'),
    )
    expect(def![0]).toMatch(/enable row level security/i)
  })

  it('leaves the deliberately-triaged findings alone', () => {
    // The four member_public_* views are load-bearing privacy projections.
    expect(sql).not.toMatch(/member_public_group_memberships|member_public_discoverability/i)
    expect(sql).not.toMatch(/member_public_has_published|member_has_standing_presence/i)
    // spatial_ref_sys is PostGIS-owned; the alter fails as postgres.
    expect(sql).not.toMatch(/alter table\s+public\.spatial_ref_sys/i)
    // Relocating extensions is breaking surgery, recommended not done.
    expect(sql).not.toMatch(/alter extension\s+(postgis|vector|pg_net)/i)
    // The partitions are deliberately deny-all; adding policies loosens them.
    expect(sql).not.toMatch(/create policy[\s\S]*_events_y\d{4}m\d{2}/i)
    // Called inside four RLS policy USING clauses — revoking breaks reads.
    expect(sql).not.toMatch(/revoke[\s\S]*current_member_explicit_group_ids/i)
    // Live PostgREST callers.
    expect(sql).not.toMatch(/revoke[\s\S]*zip_is_proximal_to_location/i)
    expect(sql).not.toMatch(/revoke[\s\S]*resolve_member_page_visibility/i)
  })
})

// Regression guard. Reads every migration, keeps the LAST definition of each
// function (that is the one in force), and requires a pinned search_path.
// Without this, the next function added without `set search_path` re-opens the
// advisor finding silently.
describe('issue #36 — no function ships with a mutable search_path', () => {
  it('every function currently in force pins search_path', () => {
    const inForce = new Map<string, { body: string; file: string }>()

    for (const name of readdirSync(MIG).filter((f) => f.endsWith('.sql')).sort()) {
      const text = stripComments(readFileSync(resolve(MIG, name), 'utf8'))
      // `create function` (post-drop) counts too — 036 uses it for three RPCs.
      const re = /create (?:or replace )?function\s+(public\.\w+)\s*\([\s\S]*?\$\$;/gi
      for (const m of text.matchAll(re)) {
        inForce.set(m[1].toLowerCase(), { body: m[0], file: name })
      }
    }

    // Non-vacuity: if the parse stops matching, the guard must fail loudly
    // rather than pass on an empty set.
    expect(inForce.size).toBeGreaterThan(25)

    const unpinned = [...inForce.entries()]
      .filter(([, v]) => !/set search_path\s*=/i.test(v.body))
      .map(([fn, v]) => `${fn} (${v.file})`)

    expect(
      unpinned,
      `Functions without a pinned search_path: ${unpinned.join(', ')}`,
    ).toEqual([])
  })
})
