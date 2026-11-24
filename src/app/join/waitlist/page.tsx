// #1298 — the waitlist landing, at its own address while it is behind the flag: `/` sends a signed-in member to
// Explore, and the flag is on only for signed-in builders and the operator.
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { flagOn } from '@/lib/flags/check'
import { aime } from '@/components/landing/landing-shared'
import { WaitlistLanding } from '@/components/waitlist/WaitlistLanding'

export const metadata: Metadata = { title: 'Join the waitlist — SocialUs', robots: { index: false, follow: false } }

export default async function WaitlistLandingPage() {
  if (!(await flagOn('waitlist-journey'))) notFound()
  return (
    <div className={`landing ${aime.variable} min-h-full font-[family-name:var(--font-landing)] text-body`}>
      <WaitlistLanding />
    </div>
  )
}
