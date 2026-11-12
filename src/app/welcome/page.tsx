// A new member's first screen after sign-up: what SocialUs is about, in the front door's own
// words (the one line, Don 2026-11-06). Reached only from the end of onboarding; once per member, and a member who
// arrived by a shared link, and so never saw the front door, still lands where they were headed.

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import { safeNext } from '@/lib/safe-next'
import { aime, HEAD, Message, PRIMARY, WRAP } from '@/components/landing/landing-shared'
import { MarkWelcomed } from './MarkWelcomed'
import { countUse } from '@/lib/usage/count-use'

export default async function WelcomePage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams
  const dest = safeNext(next, '/explore')
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/')
  if (user.user_metadata?.welcomed === true) redirect(dest)
  // F133 — the last sign-up step: the welcome, reached once per member.
  await countUse({ step: 'welcomed' }, user.id)

  return (
    <div className={`landing ${aime.variable} min-h-full font-[family-name:var(--font-landing)] text-body`}>
      <MarkWelcomed />
      <main className={`${WRAP} py-12 md:py-16`}>
        <p className={`${HEAD} text-title-1 text-[var(--color-ink)]`}>SocialUs</p>
        <div className="mt-8 text-center md:text-left">
          <Message />
        </div>
        <div className="mt-12 flex justify-center md:justify-start">
          <Link href={dest} className={PRIMARY}>
            Get started
          </Link>
        </div>
      </main>
    </div>
  )
}
