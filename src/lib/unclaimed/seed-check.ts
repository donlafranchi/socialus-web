// #1027 — what a daily seed PR must satisfy before it opens. Pure; scripts/unclaimed/check-seed.ts feeds it the files.
export type SeedRow = { name: string; confidence?: string }

const cells = (line: string) => line.split('|').slice(1, -1).map((c) => c.trim())

export function ledgerRows(ledger: string): { date: string; name: string }[] {
  return ledger.split('\n').filter((l) => /^\| \d{4}-\d{2}-\d{2} \|/.test(l)).map((l) => ({ date: cells(l)[0]!, name: cells(l)[1]! }))
}

export function checkSeed(o: { date: string; rows: SeedRow[]; ledger: string; overrides: { stockOnly?: string[] }; prBody?: string }): string[] {
  const out: string[] = []
  const led = ledgerRows(o.ledger)
  const today = led.filter((r) => r.date === o.date).map((r) => r.name)
  for (const r of o.rows) if (!today.includes(r.name)) out.push(`ADDED.md has no ${o.date} row for "${r.name}"`)
  const names = new Set(o.rows.map((r) => r.name))
  for (const n of today) if (!names.has(n)) out.push(`ADDED.md has a ${o.date} row for "${n}", which is not in the makers file`)
  const first = led.findIndex((r) => r.date === o.date)
  if (first >= 0 && led.slice(first).some((r) => r.date < o.date)) out.push(`ADDED.md has older rows after the first ${o.date} row (append at the end)`)
  const asOf = o.ledger.match(/\*\*As of (\d{4}-\d{2}-\d{2})\*\*/)?.[1]
  if (!asOf || asOf < o.date) out.push(`ADDED.md "As of" is ${asOf ?? 'missing'}, expected ${o.date} or later`)
  const stock = o.overrides.stockOnly ?? []
  const dup = stock.filter((n, i) => stock.indexOf(n) !== i)
  if (dup.length) out.push(`photo-overrides.json stockOnly lists twice: ${dup.join(', ')}`)
  for (const r of o.rows) if (/stock/i.test(r.confidence ?? '') && !stock.includes(r.name)) out.push(`"${r.name}" says stock photos but is not in photo-overrides.json stockOnly`)
  if (o.prBody !== undefined) out.push(...checkSeedPrBody(o.prBody))
  return out
}

/** Mirrors .github/workflows/issue-lint.yml, which also reads PR bodies. */
export function checkSeedPrBody(body: string): string[] {
  const out: string[] = []
  if (!/Kind:[*_\s]*(scenario|change|bug|chore)\b/i.test(body)) out.push('PR body: missing `Kind:`')
  if (!/Scenario:[*_\s]*(F\d+|none)\b/i.test(body)) out.push('PR body: missing `Scenario:`')
  if (!/Path:[*_\s]*(well-worn|new territory)/i.test(body)) out.push('PR body: missing `Path:` (well-worn | new territory)')
  if (!/#\d+/.test(body)) out.push('PR body: cites no Issue (`Closes #123`)')
  return out
}
