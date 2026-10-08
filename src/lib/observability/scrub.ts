// #490 — what may leave the platform in an error report. Allow-list in spirit:
// the route, the exception type and stack, the device kind. Everything a member
// typed or is (user, cookies, bodies, query strings, free-form extras, request
// data) is dropped, and emails and phone numbers are cut out of every string.

import type { ErrorEvent } from '@sentry/nextjs'

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g
const PHONE = /(?:\+?1[\s.-]?)?(?:\(\d{3}\)|\d{3})[\s.-]?\d{3}[\s.-]?\d{4}/g
const HEADERS_KEPT = new Set(['user-agent'])

export function scrubText(text: string): string {
  return text.replace(EMAIL, '[email]').replace(PHONE, '[phone]')
}

function scrubUrl(url: string): string {
  return scrubText(url.split('?')[0]!.split('#')[0]!)
}

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
