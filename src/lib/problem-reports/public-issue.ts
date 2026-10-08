// #443 — a member's private report becomes a scrubbed public Issue. Allow-list:
// the route (no query string), the role (not who), a short build, the browser
// FAMILY, the report id that links back to the private row, and a short excerpt
// with emails, phones and zip-like numbers cut out. The member id, the user-agent
// string and everything else stay in the private table.

import { scrubText } from '@/lib/observability/scrub'

export interface ProblemReportRow {
  id: string
  createdAt: Date
  memberId: string | null
  role: string
  route: string
  buildSha: string | null
  userAgent: string | null
  description: string
}

const EXCERPT_MAX = 400
const TITLE_MAX = 100

export function browserFamily(ua: string | null | undefined): string {
  if (!ua) return 'unknown browser'
  const os = /iPhone|iPad|iPod/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac OS X|Macintosh/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : null
  const browser = /Firefox\//.test(ua) ? 'Firefox' : /Edg\//.test(ua) ? 'Edge' : /Chrome\/|CriOS\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : null
  if (!browser) return 'unknown browser'
  return os ? `${browser} on ${os}` : browser
}

/** Emails and phones (shared scrub), then zip-like and long digit runs. */
function scrubExcerpt(text: string): string {
  return scrubText(text).replace(/\b\d{5}(?:-\d{4})?\b/g, '[number]').replace(/\d{6,}/g, '[number]')
}

function routePath(route: string): string {
  const path = route.split(/[?#]/)[0] || '/'
  return scrubText(path)
}

function oneLine(text: string, max: number): string {
  const line = text.replace(/\s+/g, ' ').trim()
  return line.length <= max ? line : `${line.slice(0, max - 1).trimEnd()}…`
}

export function publicIssue(report: ProblemReportRow): { title: string; body: string; labels: string[] } {
  const excerpt = oneLine(scrubExcerpt(report.description), EXCERPT_MAX)
  const title = `bug · ${oneLine(excerpt || 'a member reported a problem', TITLE_MAX - 6)}`
  const body = [
    '**Kind:** bug',
    '**Scenario:** none',
    '**Path:** well-worn: a member reported a problem; the pipeline files it and the triage agent labels it.',
    '',
    'A member reported this from the app. The full report is in the private table; nothing about who sent it is here.',
    '',
    `- Route: \`${routePath(report.route)}\``,
    `- Role: ${report.role}`,
    `- Build: \`${(report.buildSha ?? 'unknown').slice(0, 7)}\``,
    `- Browser: ${browserFamily(report.userAgent)}`,
    `- Report: \`${report.id}\``,
    '',
    '> ' + (excerpt || '(no description)'),
  ].join('\n')
  return { title: title.slice(0, TITLE_MAX), body, labels: ['bug', 'member-report', 'needs-triage'] }
}
