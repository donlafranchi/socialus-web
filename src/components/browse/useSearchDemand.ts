'use client'

// #909 — counts a settled Explore search (anonymously, server side). Settled = the box has not changed for
// SEARCH_SETTLE_MS; the same text in the same area counts once per visit. The server dedupes again.

import { useEffect, useRef } from 'react'

export const SEARCH_SETTLE_MS = 1500

export function useSearchDemand({
  query,
  resultCount,
  metroSlug,
  areaId,
  failed,
  log,
}: {
  query: string
  resultCount: number
  metroSlug: string | null
  areaId: string | null
  failed: boolean
  log: (query: string, metroSlug: string | null, areaId: string | null, resultCount: number) => Promise<unknown>
}) {
  const sent = useRef(new Set<string>())
  const count = useRef(resultCount)
  useEffect(() => {
    count.current = resultCount
  }, [resultCount])
  const q = query.trim()
  useEffect(() => {
    if (failed || q.length < 2) return
    const key = JSON.stringify([q.toLowerCase(), metroSlug, areaId])
    if (sent.current.has(key)) return
    const id = window.setTimeout(() => {
      sent.current.add(key)
      void log(q, metroSlug, areaId, count.current).catch(() => {})
    }, SEARCH_SETTLE_MS)
    return () => window.clearTimeout(id)
  }, [q, metroSlug, areaId, failed, log])
}
