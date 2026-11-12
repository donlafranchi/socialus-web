// F129 (#1239): what SocialUs can and can't do, as one short answer by who is
// asking. The lookup tool's `can_do` verb, and the renderer the nightly pack
// (scripts/knowledge/capabilities.ts) writes into socialus-plan, so the tool
// and the pack read the same words.
//
// Lines come from the store (knowledge.capabilities), kept true each night by
// the generator: "can" only when shipped, checked and passing the live smoke.
// One line per thing, in a member's words; each ends with its feature id, the
// link to its feature (F129.5). Held under 1,500 words (F129.2), checked in
// tests/knowledge-capabilities.test.ts.

import { z } from 'zod'
import type { ClientBase } from 'pg'
import type { KnowledgeTool } from './tools'

export type Who = 'visitor' | 'member' | 'runner'
export const WHO: Who[] = ['visitor', 'member', 'runner']

export const WHO_WORDS: Record<Who, string> = {
  visitor: 'Someone without an account',
  member: 'A member',
  runner: 'Someone who runs a Page or an event',
}

export interface CapabilityLine {
  id: string
  who: Who[]
  words: string
  status: 'can' | 'cant_now' | 'cant_yet' | 'not_planned'
  why: string | null
  feature: string | null
  waits_on: string | null
  waits_on_words: string | null
}

export async function readCapabilities(db: ClientBase, who?: Who): Promise<CapabilityLine[]> {
  const { rows } = await db.query<CapabilityLine>(
    'select id, who, words, status, why, feature, waits_on, waits_on_words from knowledge.capabilities($1)',
    [who ?? null],
  )
  return rows
}

/** Why a line can't be done yet, in plain words: its condition, or what is missing. */
function because(l: CapabilityLine): string {
  if (l.status === 'not_planned') return 'not planned'
  if (l.status === 'cant_yet' && l.waits_on_words) return `waiting on: ${l.waits_on_words.replace(/\.$/, '')}`
  const why = (l.why ?? 'Not built yet.').replace(/\.$/, '')
  return why[0].toLowerCase() + why.slice(1)
}

const tag = (l: CapabilityLine) => (l.feature ? ` [${l.feature}]` : '')

/** One section per kind of person: can, can't right now, can't yet. */
export function renderAnswer(lines: CapabilityLine[], who?: Who, heading = true): string {
  const people = who ? [who] : WHO
  const out: string[] = []
  if (heading) {
    out.push('What SocialUs can and can\'t do', '')
    out.push('Only what is live on socialus.org and passing its overnight check is listed as possible.', '')
  }
  for (const p of people) {
    const mine = lines.filter((l) => l.who.includes(p))
    const can = mine.filter((l) => l.status === 'can')
    const now = mine.filter((l) => l.status === 'cant_now')
    const yet = mine.filter((l) => l.status === 'cant_yet' || l.status === 'not_planned')
    out.push(`${WHO_WORDS[p]} can:`)
    out.push(...(can.length ? can.map((l) => `- ${l.words}${tag(l)}`) : ['- nothing yet']))
    if (now.length) {
      out.push("Can't right now:")
      out.push(...now.map((l) => `- ${l.words}: ${because(l)}${tag(l)}`))
    }
    if (yet.length) {
      out.push("Can't yet:")
      out.push(...yet.map((l) => `- ${l.words} (${because(l)})${tag(l)}`))
    }
    out.push('')
  }
  return out.join('\n').trimEnd() + '\n'
}

export function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length
}

const define = <S extends z.ZodRawShape>(t: KnowledgeTool<S>) => t as unknown as KnowledgeTool

export const CAPABILITY_TOOLS: KnowledgeTool[] = [
  define({
    name: 'can_do',
    description:
      'What SocialUs can and can\'t do, as one short answer: for someone without an account (visitor), a member, or someone who ' +
      'runs a Page or an event (runner), or all three. One line each: what they can do today (only what is shipped and passing ' +
      'the overnight live check), what they can\'t right now because that check is failing, and what they can\'t yet, with the ' +
      'condition it waits on or "not planned". Each line ends with its feature id.',
    input: { who: z.enum(['visitor', 'member', 'runner']).optional().describe('visitor, member or runner; all three if left out.') },
    run: async (db, { who }) => {
      const lines = await readCapabilities(db, who)
      if (lines.length === 0) return { text: 'Nothing recorded yet about what SocialUs can do.' }
      return { text: renderAnswer(lines, who) }
    },
  }),
]
