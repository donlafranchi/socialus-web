'use server'

// #1183 — posts from members: create, take down, answer, and search. Failures come back as data, never a throw.

import { createClient } from '@/lib/supabase-server'
import { resolveActionContext } from '@/lib/action-context'
import { MEMBER_POST_REFUSED, memberPostAnswer, memberPostCreate, memberPostWithdraw, type MemberPostCreateInput } from '@/actions'
import { ValidationError } from '@/actions/_lib/errors'
import { NOT_ON_LIST, TOO_MANY } from '@/actions/group/labels'
import { readMemberPosts, type MemberPost } from '@/lib/member-posts/read'
import type { BrowseScope } from '@/lib/feed/browse-feed'
import { countUse } from '@/lib/usage/count-use'

const SAYABLE = new Set<string>([...Object.values(MEMBER_POST_REFUSED), NOT_ON_LIST, TOO_MANY])

type Result<T> = ({ ok: true } & T) | { ok: false; message?: string; signedOut?: true }

async function run<T>(fn: (id: string) => Promise<T>): Promise<Result<T>> {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) return { ok: false, signedOut: true }
  try {
    return { ok: true, ...(await fn(data.user.id)) }
  } catch (err) {
    // A refusal the member can act on is said in its own words; anything else is a plain failure.
    if (err instanceof ValidationError && SAYABLE.has(err.message)) return { ok: false, message: err.message }
    console.error('[member-posts] action failed:', err instanceof Error ? err.message : err)
    return { ok: false }
  }
}

export async function createMemberPostAction(input: MemberPostCreateInput): Promise<Result<{ postId: string }>> {
  return run(async (id) => {
    const r = await memberPostCreate(resolveActionContext({ actingMemberId: id }), input)
    // F133 — writing a post (an Ask is its own part) and, once, a first post; counted after the response.
    await countUse({ part: input.kind === 'ask' ? 'ask' : 'posts' }, id)
    await countUse({ step: 'first_post' }, id)
    return r
  })
}

export async function withdrawMemberPostAction(postId: string): Promise<Result<{ done: true }>> {
  return run(async (id) => {
    await memberPostWithdraw(resolveActionContext({ actingMemberId: id }), { postId })
    return { done: true as const }
  })
}

export async function answerMemberPostAction(postId: string, on: boolean): Promise<Result<{ on: boolean }>> {
  return run((id) => memberPostAnswer(resolveActionContext({ actingMemberId: id }), { postId, on }))
}

/** Search's "From neighbors" group. Signed out, or a failed read, is no group: the rest of search stands. */
export async function searchMemberPostsAction(scope: BrowseScope, search: string): Promise<MemberPost[]> {
  if (!search.trim()) return []
  const supabase = await createClient()
  return readMemberPosts(supabase, { scope, search, limit: 24 }).catch((e) => {
    console.error('[member-posts] search failed:', (e as Error).message)
    return []
  })
}
