#!/usr/bin/env tsx
// #1261 — load simulation, step 1: the people and the Page the crowd will use.
//   npx tsx evals/load/prepare.ts
//
// LOCAL ONLY. Refuses any Supabase, database or app address that is not this
// machine: production holds real members and is on a rate-limited plan.
//
// Made the way a member's would be (CLAUDE.md § The seeds are privileged):
// accounts through Auth plus the member.create handler (what the signup hook
// runs; the hook is not wired on a local stack, as scripts/builders.ts notes),
// the Page through group.create and group.activate. The pin is a direct insert,
// as createLocationAction does. Each member then signs in through Auth and keeps
// the cookie the app itself sets, so the crowd is signed in for real.
//
// Also: the Server Action ids for ♡ and report (read from the build), and the
// first hit against the fresh server (the cold start) versus warm hits.
// Writes load-out/fixture.json. Idempotent: a second run reuses what it made.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { Client } from 'pg'
import { getHandler, groupCreate, groupActivate } from '../../src/actions'
import { resolveActionContext } from '../../src/lib/action-context'
import { RULES_VERSION } from '../../src/lib/creator-rules'

const need = (name: string) => {
  const v = process.env[name]?.trim()
  if (!v) throw new Error(`${name} is not set`)
  return v
}
const LOCAL = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])
const SUPABASE_URL = need('SUPABASE_URL')
const DATABASE_URL = need('DATABASE_URL')
const BASE = need('LOAD_BASE_URL').replace(/\/$/, '')
for (const [name, url] of [['SUPABASE_URL', SUPABASE_URL], ['DATABASE_URL', DATABASE_URL], ['LOAD_BASE_URL', BASE]]) {
  const host = new URL(url).hostname
  if (!LOCAL.has(host)) throw new Error(`${name} points at ${host}. The load simulation runs against this machine only, never production.`)
}
const ANON = need('SUPABASE_ANON_KEY')
const admin = createClient(SUPABASE_URL, need('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } })
const db = new Client({ connectionString: DATABASE_URL })
const OUT = process.env.LOAD_OUT || 'load-out'
// Under GoTrue's local limit of 30 sign-ins per 5 minutes; the crowd shares them.
const MEMBERS = Math.min(Number(process.env.LOAD_MEMBERS || 20), 25)
const PAGE_NAME = 'Load Test Kite Club'
const pad = (n: number) => String(n).padStart(2, '0')
const email = (i: number) => `load-${pad(i)}@load.invalid`
const password = (i: number) => `load-sim-${pad(i)}-local-only`
const ctx = (actingMemberId: string) => resolveActionContext({ actingMemberId })
const one = async <T>(sql: string, args: unknown[] = []) => (await db.query(sql, args)).rows[0] as T | undefined

async function member(i: number): Promise<string> {
  let id = (await one<{ id: string }>(`select id from auth.users where lower(email) = $1`, [email(i)]))?.id
  if (!id) {
    const { data, error } = await admin.auth.admin.createUser({ email: email(i), password: password(i), email_confirm: true })
    if (error || !data.user) throw new Error(`could not create ${email(i)}: ${error?.message}`)
    id = data.user.id
  }
  for (let t = 0; t < 3 && !(await one(`select 1 from public.members where id = $1`, [id])); t++) await new Promise((r) => setTimeout(r, 1000))
  if (!(await one(`select 1 from public.members where id = $1`, [id]))) {
    await getHandler('member.create')!(ctx('self-bootstrap'), { authUserId: id, email: email(i), handleSuggestion: `load-member-${pad(i)}`, displayName: `Load ${pad(i)}` })
  }
  return id
}

async function page(owner: string): Promise<{ groupId: string; path: string }> {
  let groupId = (await one<{ id: string }>(`select id from public.groups where founder_member_id = $1 and name = $2`, [owner, PAGE_NAME]))?.id
  if (!groupId) {
    // A pin inside Sacramento's Oak Park, the way tests/readable-urls-db.test.ts places one.
    const loc = await one<{ id: string }>(
      `insert into public.locations (member_id, kind, label, slug, geography)
       select $1, 'permanent', 'Load Test Field', 'load-test-field', st_pointonsurface(n.geography::geometry)::geography
         from public.places n join public.places c on c.id = n.parent_id
        where n.kind = 'neighborhood' and n.slug = 'oak-park' and c.slug = 'sacramento' and n.deleted_at is null
        limit 1
       returning id`, [owner])
    if (!loc) throw new Error('no Oak Park neighbourhood on this stack to pin the Page in')
    groupId = (await groupCreate(ctx(owner), { kind: 'group', founderMemberId: owner, name: PAGE_NAME, anchorLocationId: loc.id, description: 'Kites on Sundays. A Page the load simulation made.' })).groupId
    await groupActivate(ctx(owner), { groupId, tags: ['Crafts & makers'], rulesVersion: RULES_VERSION })
  }
  const g = await one<{ place_url_slug: string; page_url_slug: string }>(`select place_url_slug, page_url_slug from public.groups where id = $1`, [groupId])
  if (!g?.place_url_slug || !g.page_url_slug) throw new Error('the Page has no address after group.activate')
  return { groupId, path: `/${g.place_url_slug}/${g.page_url_slug}` }
}

// The cookie the app's own @supabase/ssr client writes, by signing in with it.
async function cookieFor(i: number): Promise<string> {
  const jar = new Map<string, string>()
  const sb = createServerClient(SUPABASE_URL, ANON, {
    cookies: { getAll: () => [...jar].map(([name, value]) => ({ name, value })), setAll: (all) => all.forEach(({ name, value }) => (value ? jar.set(name, value) : jar.delete(name))) },
  })
  const { error } = await sb.auth.signInWithPassword({ email: email(i), password: password(i) })
  if (error) throw new Error(`sign-in ${email(i)}: ${error.message}`)
  return [...jar].map(([n, v]) => `${n}=${v}`).join('; ')
}

function actionIds(): Record<'heart' | 'report', string> {
  const m = JSON.parse(readFileSync(join(process.env.LOAD_APP_DIR || '.', '.next/server/server-reference-manifest.json'), 'utf8')) as { node: Record<string, { workers: Record<string, { exportedName?: string; filename?: string }> }> }
  const find = (name: string, file: string) => {
    const hit = Object.entries(m.node).find(([, v]) => Object.values(v.workers).some((w) => w.exportedName === name && w.filename?.endsWith(file)) && 'app/[place]/[page]/page' in v.workers)
    if (!hit) throw new Error(`${name} is not a Server Action on the Page route in this build`)
    return hit[0]
  }
  return { heart: find('setHeartAction', 'heart-save-actions.ts'), report: find('sendReportAction', 'report-actions.ts') }
}

// A refusal (already reported, too many open) is the handler working; "didn't go through" is a failure.
const reportHandled = (body: string) => body.includes('"ok":true') || body.includes('already reported') || body.includes('a lot of reports open')

const timed = async (init: () => Promise<Response>) => {
  const t = performance.now()
  const res = await init()
  const body = await res.text()
  return { ms: Math.round(performance.now() - t), status: res.status, body }
}
const action = (path: string, id: string, cookie: string, input: unknown) =>
  fetch(BASE + path, { method: 'POST', headers: { 'Next-Action': id, 'Content-Type': 'text/plain;charset=UTF-8', Accept: 'text/x-component', Origin: BASE, Cookie: cookie }, body: JSON.stringify([input]) })

async function main() {
  await db.connect()
  const ids: string[] = []
  for (let i = 0; i < MEMBERS; i++) ids.push(await member(i))
  const { groupId, path } = await page(ids[0]!)
  const cookies: string[] = []
  for (let i = 0; i < MEMBERS; i++) cookies.push(await cookieFor(i))
  const actions = actionIds()

  // The first hit on each kind of request against a server nothing has touched, then warm ones.
  const cold = {
    pageSignedOut: await timed(() => fetch(BASE + path)),
    pageSignedIn: await timed(() => fetch(BASE + path, { headers: { Cookie: cookies[1]! } })),
    heart: await timed(() => action(path, actions.heart, cookies[1]!, { groupId, on: true })),
    report: await timed(() => action(path, actions.report, cookies[1]!, { subjectKind: 'group', subjectId: groupId, category: 'spam', body: 'Load simulation report (local stack).' })),
  }
  const warm: number[] = []
  for (let i = 0; i < 10; i++) warm.push((await timed(() => fetch(BASE + path))).ms)
  warm.sort((a, b) => a - b)

  // Self-check: nothing below is believed unless each request did what a member's would.
  const problems: string[] = []
  if (cold.pageSignedOut.status !== 200 || !cold.pageSignedOut.body.includes(PAGE_NAME)) problems.push(`signed-out Page: HTTP ${cold.pageSignedOut.status}, name ${cold.pageSignedOut.body.includes(PAGE_NAME) ? 'shown' : 'missing'}`)
  if (cold.pageSignedIn.status !== 200 || !cold.pageSignedIn.body.includes(PAGE_NAME)) problems.push(`signed-in Page: HTTP ${cold.pageSignedIn.status}`)
  if (cold.heart.status !== 200 || !cold.heart.body.includes('"ok":true')) problems.push(`♡: HTTP ${cold.heart.status} ${cold.heart.body.slice(0, 300)}`)
  if (cold.report.status !== 200 || !reportHandled(cold.report.body)) problems.push(`report: HTTP ${cold.report.status} ${cold.report.body.slice(0, 300)}`)
  const strip = (r: { ms: number; status: number }) => ({ ms: r.ms, status: r.status })
  mkdirSync(OUT, { recursive: true })
  writeFileSync(join(OUT, 'fixture.json'), JSON.stringify({
    base: BASE, path, groupId, pageName: PAGE_NAME, cookies, actions,
    cold: { pageSignedOut: strip(cold.pageSignedOut), pageSignedIn: strip(cold.pageSignedIn), heart: strip(cold.heart), report: strip(cold.report), warmMedianMs: warm[5], warmP90Ms: warm[9] },
  }, null, 2))
  console.log(`Page ${path} (${groupId}), ${MEMBERS} signed-in members, first hit ${cold.pageSignedOut.ms} ms, warm median ${warm[5]} ms.`)
  await db.end()
  if (problems.length) { console.error('Self-check failed; the load run would measure the wrong thing:\n- ' + problems.join('\n- ')); process.exit(1) }
}

main().catch(async (e) => { console.error(e instanceof Error ? e.message : e); await db.end().catch(() => {}); process.exit(1) })
