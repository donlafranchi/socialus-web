// #490 — what may leave the platform in an error report. Allow-list in spirit:
// the route, the exception type and stack, the device kind. Everything a member
// typed or is (user, cookies, bodies, query strings, free-form extras, request
// data) is dropped, and emails and phone numbers are cut out of every string.

import type { ErrorEvent, Event } from '@sentry/nextjs'

type TransactionEvent = Event & { type: 'transaction' }

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g
const PHONE = /(?:\+?1[\s.-]?)?(?:\(\d{3}\)|\d{3})[\s.-]?\d{3}[\s.-]?\d{4}/g
const HEADERS_KEPT = new Set(['user-agent'])

export function scrubText(text: string): string {
  return text.replace(EMAIL, '[email]').replace(PHONE, '[phone]')
}

function scrubUrl(url: string): string {
  return scrubText(url.split('?')[0]!.split('#')[0]!)
}

function scrubUrlsIn(text: string): string {
  return scrubText(text.replace(/\?[^\s#]*/g, '').replace(/#\S*/g, ''))
}

const SPAN_DATA_DROPPED = new Set(['http.query', 'http.fragment'])
const SPAN_DATA_URLS = new Set(['url', 'http.url', 'url.full', 'server.address'])

export function scrubEvent<T extends ErrorEvent>(event: T): T {
  const out: ErrorEvent = { ...event }
  delete out.user
  delete out.extra
  if (typeof out.message === 'string') out.message = scrubText(out.message)
  if (out.request) {
    const headers = Object.fromEntries(
      Object.entries(out.request.headers ?? {}).filter(([k]) => HEADERS_KEPT.has(k.toLowerCase())),
    )
    out.request = {
      ...(out.request.url ? { url: scrubUrl(out.request.url) } : {}),
      ...(out.request.method ? { method: out.request.method } : {}),
      ...(Object.keys(headers).length ? { headers } : {}),
    }
  }
  if (out.exception?.values) {
    out.exception = {
      ...out.exception,
      values: out.exception.values.map((v) => (typeof v.value === 'string' ? { ...v, value: scrubText(v.value) } : v)),
    }
  }
  if (out.breadcrumbs) {
    out.breadcrumbs = out.breadcrumbs.map((b) => {
      const { data: _data, ...rest } = b
      void _data
      return typeof rest.message === 'string' ? { ...rest, message: scrubText(rest.message) } : rest
    })
  }
  return out as T
}

// #1455 — sampled traces carry page and request URLs: keep paths and timings, drop the rest.
export function scrubTransaction<T extends TransactionEvent>(event: T): T {
  const out: TransactionEvent = scrubEvent(event as unknown as ErrorEvent) as unknown as TransactionEvent
  if (typeof out.transaction === 'string') out.transaction = scrubUrl(out.transaction)
  if (out.spans) {
    out.spans = out.spans.map((span: NonNullable<Event['spans']>[number]) => {
      const data = Object.fromEntries(
        Object.entries(span.data ?? {})
          .filter(([k]) => !SPAN_DATA_DROPPED.has(k))
          .map(([k, v]) => [k, typeof v === 'string' && SPAN_DATA_URLS.has(k) ? scrubUrl(v) : v]),
      )
      return { ...span, ...(span.description ? { description: scrubUrlsIn(span.description) } : {}), data }
    })
  }
  return out as T
}
