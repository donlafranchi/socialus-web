// #409 — the picture a shared link shows when its Page has none: the site's
// name on the navy frame. 1200×630, the size link previews expect.

import { ImageResponse } from 'next/og'

const NAVY = '#12233a' // --color-blue-900
const GOLD = '#ddbb74' // --color-gold-300, on navy only

export const dynamic = 'force-static'

export function GET() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: NAVY, color: 'white' }}>
        <div style={{ fontSize: 112, fontWeight: 700, letterSpacing: -2 }}>SocialUs</div>
        <div style={{ marginTop: 24, fontSize: 40, color: GOLD }}>Find and support the people near you.</div>
      </div>
    ),
    { width: 1200, height: 630 },
  )
}
