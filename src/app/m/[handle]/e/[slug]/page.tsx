// T082 — Public gathering Item page, Member-hosted path (F034).
// Spec:   planning/now/scenario-F034-member-hosts-recurring-gathering.md
//   /m/[handle]/e/[slug] — a gathering hosted by a Member (no Group filing).
// The Member page (/m/[handle]) is the one intentionally global namespace per
// ADR-20; gathering Items not filed under a Group hang off it.

import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase-server'
import { resolveGathering, gatheringWhenLabel } from '@/lib/items/resolve-gathering'
import { GatheringPublicPage } from '@/components/item/GatheringPublicPage'

interface Props {
  params: Promise<{ handle: string; slug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { handle, slug } = await params
  const supabase = await createClient()
  const gathering = await resolveGathering(supabase, { handle, itemSlug: slug })
  if (!gathering) {
    return { title: 'Not found — SocialUs' }
  }
  return {
    title: `${gathering.title} — SocialUs`,
    description: gathering.description || gathering.title,
  }
}

export default async function MemberGatheringPage({ params }: Props) {
  const { handle, slug } = await params
  const supabase = await createClient()
  const gathering = await resolveGathering(supabase, { handle, itemSlug: slug })
  if (!gathering) {
    notFound()
  }
  return (
    <GatheringPublicPage
      gathering={gathering}
      groupHref={null}
      nextOccurrenceLabel={gatheringWhenLabel(gathering.startsAt, gathering.endsAt, gathering.recurrenceRule)}
      shareUrl={`/m/${handle}/e/${slug}`}
    />
  )
}
