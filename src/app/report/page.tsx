// #443 — Report a problem. Signed-in members; anyone else is asked to sign in and
// brought back. `?from=` carries the screen they were on (same-origin paths only).

import Link from 'next/link'
import { createClient } from '@/lib/supabase-server'
import { safeNext } from '@/lib/safe-next'
import { ReportProblemForm } from './ReportProblemForm'
import { reportProblemAction } from './actions'

export const dynamic = 'force-dynamic'

export default async function ReportPage({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  const { from } = await searchParams
  const route = safeNext(from, '/').split(/[?#]/)[0] || '/'
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  return (
    <main className="mx-auto w-full max-w-read gutter py-6 pb-nav" data-testid="report-page">
      <h1 className="text-title-1 md:text-title-1-lg text-[var(--color-fg)]">Report a problem</h1>
      {data.user ? (
        <div className="mt-4">
          <ReportProblemForm route={route} onSubmit={reportProblemAction} />
        </div>
      ) : (
        <p className="mt-4 text-body text-[var(--color-fg)]">
          <Link href="/auth/login?next=%2Freport" className="underline">
            Sign in
          </Link>{' '}
          to tell us what went wrong.
        </p>
      )}
    </main>
  )
}
