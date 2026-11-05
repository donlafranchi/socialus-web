// #1183 — post without a Page (plan #270 B). Signed in, and a confirmed phone first ([always], 2026-10-31).
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import { NewMemberPost } from './NewMemberPost'

export const dynamic = 'force-dynamic'

export default async function NewMemberPostPage() {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  if (!data.user) redirect(`/auth/login?next=${encodeURIComponent('/neighbors/new')}`)
  const needsPhone = !data.user.phone_confirmed_at && data.user.app_metadata?.builder !== true
  return (
    <main className="mx-auto w-full max-w-form gutter py-8 pb-dock">
      <h1 className="mb-2 text-title-1 text-[var(--color-fg)]">Post to the neighborhood</h1>
      <p className="mb-6 text-body-sm text-[var(--color-fg-muted)]">No Page needed. It’s signed with your name and the neighborhood, and comes down on its own.</p>
      <NewMemberPost needsPhone={needsPhone} phoneOpen={process.env.PHONE_VERIFICATION_REQUIRED === '1'} />
    </main>
  )
}
