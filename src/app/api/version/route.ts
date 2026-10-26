// GET /api/version — #958: the build that is live now, so an open tab can tell it is behind.
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json({ id: process.env.VERCEL_GIT_COMMIT_SHA ?? '' }, { headers: { 'Cache-Control': 'no-store' } })
}
