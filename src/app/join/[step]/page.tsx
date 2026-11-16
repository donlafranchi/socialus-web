// #1299 — each waitlist screen at its own address (/join/plans, /join/zip, …), behind the waitlist-journey flag.
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { flagOn } from '@/lib/flags/check'
import { aime } from '@/components/landing/landing-shared'
import { JourneyScreen } from '@/components/waitlist/JourneyScreen'
import { isStep } from '@/lib/waitlist/journey'

export const metadata: Metadata = { title: 'Join the waitlist — SocialUs', robots: { index: false, follow: false } }

export default async function WaitlistStepPage({ params }: { params: Promise<{ step: string }> }) {
  const { step } = await params
  if (!isStep(step) || !(await flagOn('waitlist-journey'))) notFound()
  return (
    <div className={`landing ${aime.variable} min-h-full font-[family-name:var(--font-landing)] text-body`}>
      <JourneyScreen step={step} />
    </div>
  )
}
