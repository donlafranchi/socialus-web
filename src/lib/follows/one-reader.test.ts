// #605 (F065.5, as amended 2026-10-11): the following list has one reader. The three tables stay
// (the PM, option B); what is guarded is that every surface showing the list reads it through
// `getMemberFollows`, and none queries the three tables for it by itself.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const THREE_TABLES = /\.from\(\s*['"](member_follows|group_memberships|member_saved_searches)['"]\s*\)/

/** The problems with one surface's source, empty when it uses the one reader and only that. */
export function readerProblems(source: string): string[] {
  const problems: string[] = []
  if (!/\bgetMemberFollows\b/.test(source)) problems.push('does not read the list through getMemberFollows')
  if (THREE_TABLES.test(source)) problems.push('queries one of the three follow tables itself')
  return problems
}

const SURFACES = ['src/app/you/following/page.tsx', 'src/components/follows/FollowingSummary.tsx']

describe('F065.5 — the following list has one reader', () => {
  it('the guard sees a surface that skips the reader or reads a table itself', () => {
    expect(readerProblems("supabase.from('member_follows').select('*')")).toEqual([
      'does not read the list through getMemberFollows',
      'queries one of the three follow tables itself',
    ])
    expect(readerProblems("import { getMemberFollows } from '@/lib/follows/get-member-follows'\nawait getMemberFollows(c, id)")).toEqual([])
  })

  // [guards F065.5]
  it.each(SURFACES)('%s reads the list only through getMemberFollows', (file) => {
    expect(readerProblems(readFileSync(resolve(__dirname, '../../..', file), 'utf8'))).toEqual([])
  })
})
