// #921 — the iOS home-screen icon (apple-touch-icon), 180×180.

import { iconImage } from '@/lib/pwa/icon'

export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

export default function AppleIcon() {
  return iconImage(180)
}
