// #301 — Create (L10): one question.
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import { WhatAreYouStarting } from '@/components/create/WhatAreYouStarting'
import { startDraftAction } from './actions'

export const dynamic = 'force-dynamic'

export default async function CreatePage() {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  if (!data.user) redirect(`/auth/login?next=${encodeURIComponent('/create')}`)
  return <WhatAreYouStarting onStart={startDraftAction} />
}
