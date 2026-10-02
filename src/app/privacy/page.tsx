import type { Metadata } from 'next'
import { TextPage } from '@/components/shell/TextPage'
import { TEXT_PAGES } from '@/lib/text-pages'

export const metadata: Metadata = { title: `${TEXT_PAGES.privacy.title} · SocialUs` }

export default function Page() {
  return <TextPage page={TEXT_PAGES.privacy} />
}
