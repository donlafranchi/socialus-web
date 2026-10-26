// #921 — /icons/192, /icons/512 and /icons/maskable-512, the manifest's icons.

import { iconImage } from '@/lib/pwa/icon'

export const dynamic = 'force-static'

const SIZES: Record<string, [number, boolean]> = { '192': [192, false], '512': [512, false], 'maskable-512': [512, true] }

export function generateStaticParams() {
  return Object.keys(SIZES).map((name) => ({ name }))
}

export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  const hit = SIZES[(await params).name]
  if (!hit) return new Response('Not found', { status: 404 })
  return iconImage(hit[0], hit[1])
}
