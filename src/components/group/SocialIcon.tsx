// #896 — simple marks for each platform, drawn in the Lucide line style.
import type { SocialPlatform } from '@/lib/groups/social-links'

const PATHS: Record<Exclude<SocialPlatform, 'website'>, React.ReactNode> = {
  instagram: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="0.5" fill="currentColor" />
    </>
  ),
  facebook: <path d="M15 3h-2.5A3.5 3.5 0 0 0 9 6.5V10H6.5v3.5H9V21h3.5v-7.5H15l.5-3.5h-3V7a1 1 0 0 1 1-1H15z" />,
  tiktok: <path d="M14 3v11.5a3.5 3.5 0 1 1-3.5-3.5M14 3c.5 2.5 2.5 4.5 5 4.5" />,
  x: <path d="M4 4h4.5L20 20h-4.5zM4 20l6.5-6.5M20 4l-6.5 6.5" />,
  youtube: (
    <>
      <rect x="2.5" y="5.5" width="19" height="13" rx="4" />
      <path d="M10 9.5v5l4.5-2.5z" fill="currentColor" />
    </>
  ),
  bluesky: <path d="M12 11c-1.5-3-5-6-7-6-1.5 0-1.5 2 0 6 .8 2 3 2.5 5 2-2.5.5-4 2-2 4 2 2 3.5 0 4-2.5.5 2.5 2 4.5 4 2.5 2-2 .5-3.5-2-4 2 .5 4.2 0 5-2 1.5-4 1.5-6 0-6-2 0-5.5 3-7 6z" />,
}

export function SocialIcon({ platform, size = 20 }: { platform: Exclude<SocialPlatform, 'website'>; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[platform]}
    </svg>
  )
}
