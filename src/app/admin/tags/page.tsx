// #287 — the operator's tag list: what is waiting for review, oldest first.

import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import { isOperator } from '@/actions/_lib/operator'
import { getPool } from '@/actions/_lib/db'
import { TagReviewList, type WaitingTag } from './TagReviewList'
import { reviewTagAction } from './actions'

export const dynamic = 'force-dynamic'

export default async function AdminTagsPage() {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  if (!isOperator(data.user?.id ?? null)) notFound()

  const { rows } = await getPool().query<WaitingTag>(
    `select t.id, t.label,
            (select count(*) from public.page_tags pt where pt.tag_id = t.id)::int as pages,
            (select count(*) from public.post_tags pt where pt.tag_id = t.id)::int as posts
       from public.tags t
      where t.review = 'needs_review'
      order by t.created_at asc
      limit 200`,
  )

  return (
    <main className="mx-auto w-full max-w-xl px-3 py-4">
      <h1 className="text-lg font-semibold text-[var(--color-fg)]">Tags to review</h1>
      <p className="mt-1 mb-4 text-sm text-[var(--color-fg-muted)]">
        Every tag shows as soon as it&rsquo;s made. Unsafe hides it everywhere; safe keeps it.
      </p>
      <TagReviewList tags={rows} onReview={reviewTagAction} />
    </main>
  )
}
