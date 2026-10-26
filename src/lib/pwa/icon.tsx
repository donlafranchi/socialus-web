// #921 — the app icon: the wordmark's navy and gold (as the share image), an S. Drawn, not stored.
import { ImageResponse } from 'next/og'

export const NAVY = '#12233a' // --color-blue-900
export const GOLD = '#ddbb74' // --color-gold-300, on navy only

/** `safe` shrinks the mark into the inner 80% a maskable icon keeps clear of the crop. */
export function iconImage(size: number, safe = false) {
  const mark = Math.round(size * (safe ? 0.5 : 0.62))
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: NAVY, color: GOLD, fontSize: mark, fontWeight: 700, letterSpacing: -2 }}>
        S
      </div>
    ),
    { width: size, height: size },
  )
}
