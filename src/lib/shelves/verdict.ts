// F121 criteria 13–14 — a shelf is judged only with at least 200 impressions from at least 10 members over 14
// days (this week and the one before; members are weekly distinct counts summed). Two judged weeks in a row at the
// top save rate: move up. Two in a row under half the median: retire, unless it is seasonal (it ends by date).
// Verdicts are proposals; Don rules on the list.

export interface ScoreRow {
  shelfId: string
  name: string
  seasonal: boolean
  weekStart: string
  impressions: number
  members: number
  taps: number
  saves: number
}

export type Verdict = 'too little data' | 'keep' | 'move up' | 'retire'
export interface ScoreLine extends ScoreRow {
  tapRate: number
  saveRate: number
  verdict: Verdict
}

const MIN_IMPRESSIONS = 200
const MIN_MEMBERS = 10
const rate = (n: number, of: number) => (of > 0 ? n / of : 0)
const prevWeek = (w: string) => new Date(Date.parse(`${w}T00:00:00Z`) - 7 * 86_400_000).toISOString().slice(0, 10)

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2
}

export function scoreboard(rows: readonly ScoreRow[]): ScoreLine[] {
  const at = new Map(rows.map((r) => [`${r.shelfId}|${r.weekStart}`, r]))
  const judged = (r: ScoreRow) => {
    const before = at.get(`${r.shelfId}|${prevWeek(r.weekStart)}`)
    return r.impressions + (before?.impressions ?? 0) >= MIN_IMPRESSIONS && r.members + (before?.members ?? 0) >= MIN_MEMBERS
  }

  // Per week, among judged shelves: who had the top save rate and who fell under half the median.
  const top = new Set<string>()
  const low = new Set<string>()
  for (const week of new Set(rows.map((r) => r.weekStart))) {
    const ws = rows.filter((r) => r.weekStart === week && judged(r))
    if (ws.length === 0) continue
    const rates = ws.map((r) => rate(r.saves, r.impressions))
    const best = Math.max(...rates)
    const half = median(rates) / 2
    ws.forEach((r, i) => {
      if (rates[i] === best) top.add(`${r.shelfId}|${week}`)
      if (rates[i]! < half) low.add(`${r.shelfId}|${week}`)
    })
  }

  const latest = new Map<string, ScoreRow>()
  for (const r of rows) if (!latest.has(r.shelfId) || r.weekStart > latest.get(r.shelfId)!.weekStart) latest.set(r.shelfId, r)

  return [...latest.values()].map((r) => {
    const two = (set: Set<string>) => set.has(`${r.shelfId}|${r.weekStart}`) && set.has(`${r.shelfId}|${prevWeek(r.weekStart)}`)
    const verdict: Verdict = !judged(r) ? 'too little data' : two(top) ? 'move up' : two(low) && !r.seasonal ? 'retire' : 'keep'
    return { ...r, tapRate: rate(r.taps, r.impressions), saveRate: rate(r.saves, r.impressions), verdict }
  })
}
