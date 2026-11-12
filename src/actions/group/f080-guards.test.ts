// #637 — standing guards for F080 criteria 2 and 3, each seen failing against a mutant
// (PR #637). Absence of code proves nothing, so these list the places that could
// break the rule and fail when a new one appears.

import { describe, it, expect, vi } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

const { query } = vi.hoisted(() => ({ query: vi.fn() }))
vi.mock('../_lib/db', () => ({ withTransaction: vi.fn(async (fn: (c: { query: typeof query }) => unknown) => fn({ query })) }))
vi.mock('../_lib/event-log', () => ({ appendEvent: vi.fn(async () => undefined) }))

import { groupPostCreate } from './post'
import type { ActionContext } from '../_lib/context'

const ROOT = resolve(__dirname, '../../..')
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    if (statSync(p).isDirectory()) return f === 'node_modules' ? [] : sources(p)
    return /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f) ? [p] : []
  })
}
const SRC = sources(join(ROOT, 'src'))
const rel = (p: string) => p.slice(ROOT.length + 1)
const naming = (re: RegExp, files = SRC) => files.filter((p) => re.test(code(p))).map(rel).sort()
const code = (p: string) => readFileSync(p, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/ .*$/gm, '')

const GROUP = '11111111-1111-1111-1111-111111111111'
const OWNER = '22222222-2222-2222-2222-222222222222'
const ctx = { actingMemberId: OWNER, viaDelegationId: null, traceId: 't', db: {} as never, now: () => new Date('2026-10-12T12:00:00Z') } as ActionContext

describe('F080.2 — text is not in scope: a post about a children\'s activity publishes', () => {
  // [guards F080.2]
  it('a post about a kids\' craft table, with no photo, is written live; and no write path filters text by topic', async () => {
    query.mockReset()
    query.mockImplementation(async (sql: string) => {
      if (/join public\.group_memberships/i.test(sql)) return { rows: [{ kind: 'business', role: 'owner', discoverability: 'listed' }], rowCount: 1 }
      if (/insert into public\.page_posts/i.test(sql)) return { rows: [{ id: '44444444-4444-4444-4444-444444444444', created_at: new Date() }], rowCount: 1 }
      if (/public\.tags|public\.post_tags/i.test(sql)) return { rows: [], rowCount: 0 }
      throw new Error('unexpected: ' + sql)
    })
    const body = 'Kids craft table this Saturday: children of all ages welcome, bring your toddler and your little ones.'
    await expect(groupPostCreate(ctx, { groupId: GROUP, body })).resolves.toMatchObject({ groupId: GROUP })
    const [, params] = (query.mock.calls as [string, unknown[]][]).find(([s]) => /insert into public\.page_posts/i.test(s))!
    expect(params).toContain(body)
    expect(params).toContain('active')

    // No write path (a handler, the text validators, the composer's action) names a topic to refuse.
    const writePaths = SRC.filter((p) => /src\/(actions\/(group|post)|app\/_actions|lib\/groups)\//.test(rel(p)))
    expect(writePaths.length).toBeGreaterThan(5)
    expect(naming(/\b(kids?|child(ren)?|minors?|toddlers?|infants?|underage)\b/i, writePaths)).toEqual([])
  })
})

describe('F080.3 — no toggle, setting, tier, request or workaround lifts the photo rule', () => {
  // [guards F080.3]
  it('every member image comes through the one picker that asks per photo, no flag or setting is read there, and the handlers that store a photo accept only what that picker uploads', () => {
    // The only code that puts a member's file in storage, and the only caller of it.
    expect(naming(/\.upload\(/)).toEqual(['src/lib/media/upload-image.ts', 'src/lib/unclaimed/upload.ts'])
    expect(naming(/from '@\/lib\/media\/upload-image'/)).toEqual(['src/components/media/PagePhotoPicker.tsx'])

    // It cannot be started until the uploader has confirmed, and it reads nothing that could skip that.
    const picker = code(join(ROOT, 'src/components/media/PagePhotoPicker.tsx'))
    expect((picker.match(/disabled=\{busy \|\| !confirmed\}/g) ?? []).length).toBeGreaterThanOrEqual(2)
    expect(picker).not.toMatch(/process\.env|localStorage|sessionStorage|searchParams|useSearchParams|cookies\(|\.role\b|\btier\b|isStaff|isAdmin|isOperator|useRole|permission/)
    expect(code(join(ROOT, 'src/lib/media/upload-image.ts'))).not.toMatch(/process\.env|NEXT_PUBLIC_[A-Z_]*(SKIP|ALLOW|BYPASS)/)

    // The handlers that store a photo address take only an address the member's own upload made.
    const writers = naming(/photo_url = \$|picture_url = \$|photoUrl/, SRC.filter((p) => /src\/actions\/group\//.test(rel(p))))
    expect(writers).toEqual(['src/actions/group/post.ts', 'src/actions/group/update-draft.ts', 'src/actions/group/update.ts'])
    for (const f of writers) expect(code(join(ROOT, f)), f).toMatch(/isOwnMediaUrl\(/)

    // And no column, setting or request in the schema can switch it off.
    const migrations = readdirSync(join(ROOT, 'supabase/migrations')).map((f) => readFileSync(join(ROOT, 'supabase/migrations', f), 'utf8')).join('\n')
    expect(migrations).not.toMatch(/(skip|bypass|waive|exempt)_?(photo|image|confirm)|photo_?(confirm|rule)_?(skip|exempt|waived)|allow_?(children|child|kids)/i)
  })
})
