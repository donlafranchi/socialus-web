import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase-server'
import { OWNERSHIP_TIERS } from '@/lib/types'
import type { Business } from '@/lib/types'
import { siteOrigin } from '@/lib/site-url'
import { BusinessListingPage } from './BusinessListingPage'

interface Props {
  params: Promise<{ slug: string }>
}

async function getBusiness(slug: string): Promise<Business | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('businesses')
    .select('*')
    .eq('slug', slug)
    .single()

  return data as Business | null
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const business = await getBusiness(slug)

  if (!business) {
    return { title: 'Business Not Found — SocialUs' }
  }

  const tierLabel = OWNERSHIP_TIERS[business.ownership_tier]?.label ?? business.ownership_tier
  const description = business.story?.trim()
    ? business.story.slice(0, 160)
    : `${tierLabel} · ${business.category} · ${business.city}, ${business.state}`

  const url = `${siteOrigin()}/business/${slug}`
  const ogImage = `${siteOrigin()}/og-default.png`

  return {
    title: `${business.name} — SocialUs`,
    description,
    openGraph: {
      title: business.name,
      description,
      url,
      images: [{ url: ogImage }],
      type: 'website',
    },
  }
}

export default async function BusinessPage({ params }: Props) {
  const { slug } = await params
  const business = await getBusiness(slug)

  if (!business) notFound()

  return <BusinessListingPage business={business} />
}
