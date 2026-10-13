// F076 — standing guards for the rules that say "never": a metro is never
// chosen for the person (c2), no role is stored on the member (c3), crossing a
// threshold never opens a metro (c12), and the number shown is never a function
// of what the person just did (c14). Absence of code proves nothing, so these
// scan for the thing that must not appear and one runs the handler for real.
//
// Criterion 16 (ordering by the cached figure) was struck 2026-10-11; its
// surviving rule is the one in the last scan: no surface reads the live counters.

import { describe, it, expect, afterAll } from 'vitest'
import { Pool } from 'pg'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve, relative, join } from 'node:path'
import { requireRunnable } from './support/runnable'
import { databaseWriteSafety } from './support/write-safe'

const ROOT = resolve(__dirname, '..')

function filesUnder(path: string): string[] {
  const abs = resolve(ROOT, path)
  const st = statSync(abs, { throwIfNoEntry: false })
  if (!st) return []
  if (st.isFile()) return [abs]
  return readdirSync(abs).flatMap((name) => filesUnder(join(path, name)))
}

const isSource = (f: string) => /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f)
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
const read = (f: string) => readFileSync(f, 'utf8')
const rel = (f: string) => relative(ROOT, f)

function offenders(paths: string[], pattern: RegExp, allow: string[] = []): string[] {
  return paths
    .flatMap((p) => filesUnder(p))
    .filter(isSource)
    .filter((f) => !allow.includes(rel(f)))
    .filter((f) => pattern.test(stripComments(read(f))))
    .map(rel)
}

describe('F076 c2 — the platform never selects a metro for the person', () => {
  const WAITLIST_SURFACES = [
    'src/components/metro',
    'src/components/onboarding',
    'src/components/explore',
    'src/app/_actions/metro-waitlist-actions.ts',
    'src/actions/metro',
    'src/lib/metro',
  ]
  // A market taken from the person's own zip is not a selection made for them;
  // a market taken from their IP, their device's position or "the nearest" is.
  const SELECTING_FOR_THEM =
    /x-forwarded-for|x-real-ip|x-vercel-ip|cf-ipcountry|\bgeolocation\b|\.geo\b|ipapi|ip-api|maxmind|\bnearest(Metro|Market)\b|st_distance|haversine|<->/i

  // [guards F076.2]
  it('no waitlist surface looks a metro up by IP, device position or distance, or pre-fills a market or role', () => {
    expect(offenders(WAITLIST_SURFACES, SELECTING_FOR_THEM)).toEqual([])
    // A pre-checked radio or a defaulted state is choosing for them just as much.
    const PREFILLED = /\bdefaultChecked\b|\bchecked=\{true\}|useState<Role(?: \| null)?>\((?!null)|useState\((?:'creator'|'patron'|"creator"|"patron")\)/
    expect(offenders(WAITLIST_SURFACES, PREFILLED)).toEqual([])
  })

  it('the scan sees the surfaces it names (so an empty result means clean, not blind)', () => {
    const seen = WAITLIST_SURFACES.flatMap((p) => filesUnder(p)).filter(isSource)
    expect(seen.length).toBeGreaterThan(5)
  })
})

function topLevelItems(body: string): string[] {
  const items: string[] = []
  let depth = 0
  let cur = ''
  for (const ch of body) {
    if (ch === '(') depth++
    if (ch === ')') {
      if (depth === 0) break
      depth--
    }
    if (ch === ',' && depth === 0) {
      items.push(cur)
      cur = ''
    } else cur += ch
  }
  return [...items, cur]
}

describe('F076 c3 — no role is stored on the member', () => {
  const MIG = resolve(ROOT, 'supabase', 'migrations')
  const statements = readdirSync(MIG)
    .filter((f) => f.endsWith('.sql'))
    .flatMap((f) =>
      stripComments(read(join(MIG, f)).replace(/--.*$/gm, ''))
        .split(';')
        .map((sql) => ({ file: f, sql: sql.replace(/\s+/g, ' ').trim() })),
    )
  // The tables that describe a person. Authority on a Page is its own link
  // (group_memberships.role) and the waitlist's role is the waitlist entry's.
  const PERSON_TABLE = /\b(?:public\.)?(members|member_[a-z_]+)\b/
  const ROLE_COLUMN = /(^|_)(role|creator|patron)($|_)/i

  // [guards F076.3]
  it('no member table has a role, creator or patron column, and the waitlist role is read only where the waitlist is handled', () => {
    const adds = statements
      .filter(({ sql }) => /^alter table (?:only )?(?:if exists )?/i.test(sql) && /add column/i.test(sql))
      .filter(({ sql }) => {
        const table = sql.match(/^alter table (?:only )?(?:if exists )?(\S+)/i)?.[1] ?? ''
        if (!PERSON_TABLE.test(table) || /metro_waitlist/.test(table)) return false
        const cols = [...sql.matchAll(/add column (?:if not exists )?(\w+)/gi)].map((m) => m[1]!)
        return cols.some((c) => ROLE_COLUMN.test(c))
      })
      .map(({ file }) => file)
    const creates = statements
      .filter(({ sql }) => /^create table (?:if not exists )?(?:public\.)?(members|member_[a-z_]+)\b/i.test(sql))
      .filter(({ sql }) => {
        const cols = topLevelItems(sql.slice(sql.indexOf('(') + 1)).map((c) => c.trim().split(' ')[0] ?? '')
        return cols.some((c) => ROLE_COLUMN.test(c))
      })
      .map(({ file }) => file)
    const copied = offenders(['src'], /metro_waitlist/, [
      'src/actions/metro/waitlist-join.ts',
      'src/actions/metro/waitlist-join-anonymous.ts',
    ])
    expect({ adds, creates, copied }).toEqual({ adds: [], creates: [], copied: [] })
  })
})

describe('F076 c12 — crossing the threshold never opens a metro', () => {
  // The only migrations that may write `is_open`: the launch metro, and the
  // seed of the F103 market rows. Everything else is a column, a read or a view.
  const ALLOWED_MIGRATIONS = ['20260914204920_metro_waitlist.sql', '20261012020000_markets.sql']
  const WRITES_IS_OPEN = /(?:\bset\s+(?:\w+\s*=\s*[^,;\n]+,\s*)*is_open\s*=(?!=)|\bis_open\s*:\s*(?:true|false)\b|insert\s+into\s+[\w.]+\s*\([^)]*\bis_open\b)/is

  // [guards F076.12]
  it('nothing writes is_open: not the application, not the scripts, and no migration except the two seeds', () => {
    const MIG = resolve(ROOT, 'supabase', 'migrations')
    const migrations = readdirSync(MIG)
      .filter((f) => f.endsWith('.sql') && !ALLOWED_MIGRATIONS.includes(f))
      .filter((f) => WRITES_IS_OPEN.test(read(join(MIG, f)).replace(/--.*$/gm, '')))
    expect({
      src: offenders(['src'], WRITES_IS_OPEN),
      scripts: offenders(['scripts'], WRITES_IS_OPEN),
      migrations,
    }).toEqual({ src: [], scripts: [], migrations: [] })
  })
})

// The counters are maintained by the two join handlers and read, as one cached
// figure, by waitlist-counts. Any other reader is a second, fresher number.
const LIVE_COUNT_READERS = [
  'src/actions/metro/waitlist-join.ts',
  'src/actions/metro/waitlist-join-anonymous.ts',
  'src/lib/metro/waitlist-counts.ts',
  'src/lib/metro/waitlist-standing.ts',
]

const safety = databaseWriteSafety(process.env.DATABASE_URL, process.env)
const WRITABLE = requireRunnable({
  claim: 'a new address and a known address get identical responses from a real database',
  available: safety.safe,
  remedy: `${safety.reason} Recipe in .env.local.example`,
})

describe.skipIf(!WRITABLE)('F076 c14 — the response is identical whether or not the address was already there', () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const addresses: string[] = []
  const saved: { id: string; creator: number; patron: number }[] = []

  afterAll(async () => {
    await pool.query(`delete from public.metro_waitlist where lower(email) = any($1)`, [addresses])
    for (const m of saved) {
      await pool.query(`update public.metro_polygons set creator_count = $2, patron_count = $3 where id = $1`, [m.id, m.creator, m.patron])
    }
    await pool.end()
  })

  // [guards F076.14]
  it('returns byte-identical responses for a new address, the same address again and another known one, and no other code shows a live count', async () => {
    expect(offenders(['src'], /\b(creator_count|patron_count|creatorCount|patronCount)\b/, LIVE_COUNT_READERS)).toEqual([])

    const { rows } = await pool.query<{ id: string; creator_count: number; patron_count: number }>(
      `select id, creator_count, patron_count from public.metro_polygons where is_open = false order by slug limit 1`,
    )
    const metro = rows[0]!
    saved.push({ id: metro.id, creator: metro.creator_count, patron: metro.patron_count })

    const { metroWaitlistJoinAnonymous } = await import('@/actions/metro/waitlist-join-anonymous')
    const { resolveAnonymousActionContext } = await import('@/lib/action-context')
    const stamp = Date.now()
    const a = `f076-guard-a-${stamp}@example.test`
    const b = `f076-guard-b-${stamp}@example.test`
    addresses.push(a, b)

    const join = (email: string) =>
      metroWaitlistJoinAnonymous(resolveAnonymousActionContext(), { metroId: metro.id, email, role: 'patron' })
    const first = await join(a)
    const again = await join(a)
    const other = await join(b)
    const afterRows = await pool.query(`select count(*)::int as n from public.metro_waitlist where lower(email) = any($1)`, [[a, b]])

    expect(again).toEqual(first)
    expect(other).toEqual(first)
    expect(Object.keys(first).sort()).toEqual(['metroId', 'metroName', 'open'])
    // The writes really happened: two addresses, two rows (so "identical" is not "nothing ran").
    expect(afterRows.rows[0].n).toBe(2)
  })
})
