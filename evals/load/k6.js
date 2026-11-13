// #1261 — load simulation, step 2: the crowd. Run by evals/load/run.sh, one level per k6 run:
//   k6 run -e SCENARIO=view-out -e VUS=200 -e OUT=load-out evals/load/k6.js
// SCENARIO: view-out | view-in (that many viewers of one Page, signed out / in),
//           tap (a burst of ♡ taps on the Page), report (a burst of reports).
// Ramp up, hold, ramp down. Thresholds fail the level; the run script records it and goes on.
// Budgets: a Page's content in 1 s (socialus-ops PERFORMANCE.md, consumer), the same for a tap's
// round trip; under 1% of requests failing.
import http from 'k6/http'
import { check, sleep } from 'k6'
import { Rate, Counter } from 'k6/metrics'

const fx = JSON.parse(open(__ENV.FIXTURE || 'load-out/fixture.json'))
const SCENARIO = __ENV.SCENARIO || 'view-out'
const VUS = Number(__ENV.VUS || 50)
const OUT = __ENV.OUT || 'load-out'
const RAMP = __ENV.RAMP || '30s'
const HOLD = __ENV.HOLD || '60s'
const URL = fx.base + fx.path
const handled = new Rate('handled') // the request did what a member's would (page shown, tap saved, report taken)
const refused = new Counter('report_refused') // the report caps answering, which is the handler working

const viewers = {
  executor: 'ramping-vus', startVUs: 0, gracefulRampDown: '10s',
  stages: [{ duration: RAMP, target: VUS }, { duration: HOLD, target: VUS }, { duration: '15s', target: 0 }],
}
const burst = (rate) => ({
  executor: 'ramping-arrival-rate', startRate: 0, timeUnit: '1s', preAllocatedVUs: rate * 2, maxVUs: rate * 6,
  stages: [{ duration: '10s', target: rate }, { duration: '30s', target: rate }, { duration: '10s', target: 0 }],
})
const RATE = Number(__ENV.RATE || (SCENARIO === 'report' ? 30 : 100))

export const options = {
  scenarios: { [SCENARIO]: SCENARIO.startsWith('view') ? viewers : burst(RATE) },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<1000'],
    handled: ['rate>0.99'],
  },
  summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
  discardResponseBodies: false,
  noCookiesReset: true,
}

const cookie = () => fx.cookies[(__VU - 1) % fx.cookies.length]
const actionParams = (id) => ({
  headers: { 'Next-Action': id, 'Content-Type': 'text/plain;charset=UTF-8', Accept: 'text/x-component', Origin: fx.base, Cookie: cookie() },
  tags: { name: SCENARIO },
  timeout: '30s',
})

export default function crowd() {
  if (SCENARIO === 'view-out' || SCENARIO === 'view-in') {
    const params = { tags: { name: SCENARIO }, timeout: '30s', headers: SCENARIO === 'view-in' ? { Cookie: cookie() } : {} }
    const res = http.get(URL, params)
    handled.add(check(res, { 'Page shown': (r) => r.status === 200 && typeof r.body === 'string' && r.body.includes(fx.pageName) }))
    sleep(1 + Math.random() * 2) // a person reading, then refreshing or moving on
  } else if (SCENARIO === 'tap') {
    const res = http.post(URL, JSON.stringify([{ groupId: fx.groupId, on: __ITER % 2 === 0 }]), actionParams(fx.actions.heart))
    handled.add(check(res, { 'tap saved': (r) => r.status === 200 && String(r.body).includes('"ok":true') }))
  } else if (SCENARIO === 'report') {
    const body = JSON.stringify([{ subjectKind: 'group', subjectId: fx.groupId, category: 'spam', body: `Load simulation report ${__VU}-${__ITER} (local stack).` }])
    const res = http.post(URL, body, actionParams(fx.actions.report))
    const text = String(res.body)
    const capped = text.includes('already reported') || text.includes('a lot of reports open')
    if (capped) refused.add(1)
    handled.add(check(res, { 'report taken or capped': (r) => r.status === 200 && (text.includes('"ok":true') || capped) }))
  }
}

const v = (m, k) => (m && m.values && m.values[k] !== undefined ? Math.round(m.values[k] * 100) / 100 : null)
export function handleSummary(data) {
  const m = data.metrics
  const broke = Object.entries(m).flatMap(([name, metric]) =>
    Object.entries(metric.thresholds || {}).filter(([, t]) => !t.ok).map(([rule]) => `${name} ${rule}`))
  const row = {
    scenario: SCENARIO, load: SCENARIO.startsWith('view') ? `${VUS} viewers` : `${RATE} per second`,
    requests: v(m.http_reqs, 'count'), rps: v(m.http_reqs, 'rate'),
    p50: v(m.http_req_duration, 'med'), p95: v(m.http_req_duration, 'p(95)'), p99: v(m.http_req_duration, 'p(99)'), max: v(m.http_req_duration, 'max'),
    failed: v(m.http_req_failed, 'rate'), handled: v(m.handled, 'rate'), refused: v(m.report_refused, 'count'),
    peakVus: v(m.vus_max, 'max'), dropped: v(m.dropped_iterations, 'count'), broke,
  }
  const name = SCENARIO.startsWith('view') ? `${SCENARIO}-${VUS}` : SCENARIO
  return {
    [`${OUT}/k6-${name}.json`]: JSON.stringify(row),
    stdout: `${name}: ${row.requests} requests, ${row.rps}/s, p50 ${row.p50} ms, p95 ${row.p95} ms, failed ${row.failed}, handled ${row.handled}${broke.length ? `, BROKE: ${broke.join('; ')}` : ''}\n`,
  }
}
