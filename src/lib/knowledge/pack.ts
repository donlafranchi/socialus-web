// F128 (#1237): the pack of how we work, one Markdown file for a chat project.
//
// Only what judging a tool, process or method against our way of working
// needs (F128 ruling, 2026-11-10): for each area, each live practice in a line
// or two with its why, how strict it is and its ring. No history, no
// evidence, no enforcing paths. Under 10,000 tokens, and it says its size.
//
// Pure: rows in, Markdown out. The pack writer (scripts/knowledge/pack.ts)
// reads the rows from the store and writes the file to socialus-ops; the
// lookup tool's review_method hands the same text to an agent, so a chat
// review and an agent review read one thing.

export interface PackPractice {
  id: string
  concern: string
  area: string
  answer: string
  why: string | null
  strength: string
  ring: string
  holds: string | null
}

export interface PackPhilosophy {
  id: string
  answer: string
}

/** The ceiling the pack is held under (F128.9). */
export const PACK_TOKEN_LIMIT = 10_000

/** The review-a-method steps live in the store as this practice; the pack writer puts them in their own file. */
export const REVIEW_METHOD_ID = 'practice.review-a-method'

/** The areas in the order the work runs. */
export const AREA_ORDER = [
  'how-deciding',
  'how-planning',
  'how-building',
  'how-reviewing',
  'how-shipping',
  'how-words',
  'how-agents',
  'how-docs',
]

/** A rough count, four characters a token, for when no tokenizer is at hand. */
export const roughTokens = (text: string) => Math.ceil(text.length / 4)

function oneLine(s: string): string {
  return s.replace(/\s+/g, ' ').trim()
}

export function renderPack(
  practices: PackPractice[],
  philosophies: PackPhilosophy[],
  today: string,
  count: (text: string) => number = roughTokens,
): { text: string; tokens: number } {
  const byArea = new Map<string, PackPractice[]>()
  for (const p of practices) {
    if (p.id === REVIEW_METHOD_ID) continue
    byArea.set(p.concern, [...(byArea.get(p.concern) ?? []), p])
  }
  const areas = [...byArea.keys()].sort(
    (a, b) => (AREA_ORDER.indexOf(a) + 1 || 99) - (AREA_ORDER.indexOf(b) + 1 || 99) || a.localeCompare(b),
  )
  const body: string[] = [
    'How to read it: each line is one live practice. Strictness is absolute (never broken), rule (broken only with',
    'a recorded reason) or guideline. Ring is adopt (how we work), trial (being tried), assess (being looked at)',
    'or hold (not now). The id after each line is its record in the knowledge store.',
    '',
  ]
  if (philosophies.length) {
    body.push('## Absolutes and principles everything rests on', '')
    for (const ph of philosophies) body.push(`- ${oneLine(ph.answer)} (${ph.id})`)
    body.push('')
  }
  for (const area of areas) {
    const list = byArea.get(area)!
    body.push(`## ${list[0].area}`, '')
    for (const p of list) {
      const holds = p.holds === 'for now' ? ', for now' : ''
      body.push(`- **${oneLine(p.answer)}** ${p.strength}, ${p.ring}${holds}. Why: ${oneLine(p.why ?? 'not recorded')} (${p.id})`)
    }
    body.push('')
  }
  const rest = body.join('\n')
  const head = (n: number) =>
    `# How we work\n\nWritten ${today} from the knowledge store. ${practices.filter((p) => p.id !== REVIEW_METHOD_ID).length} live practices, about ${n.toLocaleString('en-US')} tokens.\n\n`
  // The size line counts the whole file, itself included: settle it in two passes.
  let n = count(head(count(rest)) + rest)
  n = count(head(n) + rest)
  const text = head(n) + rest
  return { text, tokens: n }
}

/** The pack without its first lines (title and date), to tell whether anything but the date changed. */
export function packBody(text: string): string {
  return text.split('\n').slice(3).join('\n')
}

export function renderSteps(steps: string, today: string): string {
  return `# Review a method against how we work\n\nWritten ${today} from the knowledge store (${REVIEW_METHOD_ID}). Use with how-we-work.md.\n\n${steps.trim()}\n`
}
