// #921 — SocialUs installs to the home screen. Colours are the palette's navy frame and white page.

import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'SocialUs',
    short_name: 'SocialUs',
    description: 'Find and support the people near you.',
    start_url: '/explore',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    theme_color: '#12233a',
    background_color: '#ffffff',
    icons: [
      { src: '/icons/192', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/512', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
