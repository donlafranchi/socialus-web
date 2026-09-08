import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

// T120 — the image storage substrate. `media` is the one bucket every image
// upload goes through (Pages first per F061, Items later) — file-shape
// assertions matching the project's migration-test convention
// (tests/migrations-member-has-published.test.ts).

const MIG = resolve(__dirname, '..', 'supabase', 'migrations')
const stripComments = (s: string) =>
  s.split('\n').map((l) => l.replace(/--.*$/, '')).join('\n')

describe('039_media_bucket.sql', () => {
  const file = resolve(MIG, '039_media_bucket.sql')
  it('exists', () => expect(existsSync(file)).toBe(true))
  const sql = existsSync(file) ? stripComments(readFileSync(file, 'utf8')) : ''

  it('creates the media bucket, public, 5MB, webp-only', () => {
    expect(sql).toMatch(/insert into storage\.buckets/i)
    expect(sql).toMatch(/'media'/)
    expect(sql).toMatch(/true/) // public
    expect(sql).toMatch(/5242880/) // 5MB in bytes
    expect(sql).toMatch(/array\['image\/webp'\]/i)
  })

  it('does not create a bucket named item-media', () => {
    expect(sql).not.toMatch(/item-media/i)
  })

  it('grants public SELECT on storage.objects for the media bucket', () => {
    expect(sql).toMatch(/create policy[^;]*storage\.objects[^;]*for select[^;]*bucket_id\s*=\s*'media'/i)
  })

  it('scopes INSERT to the uploader\'s own member-id folder', () => {
    expect(sql).toMatch(/create policy[^;]*storage\.objects[^;]*for insert[^;]*storage\.foldername\(name\)\)\[1\]\s*=\s*auth\.uid\(\)::text/i)
  })

  it('scopes UPDATE to the uploader\'s own member-id folder', () => {
    expect(sql).toMatch(/create policy[^;]*storage\.objects[^;]*for update[^;]*storage\.foldername\(name\)\)\[1\]\s*=\s*auth\.uid\(\)::text/i)
  })

  it('scopes DELETE to the uploader\'s own member-id folder', () => {
    expect(sql).toMatch(/create policy[^;]*storage\.objects[^;]*for delete[^;]*storage\.foldername\(name\)\)\[1\]\s*=\s*auth\.uid\(\)::text/i)
  })
})
