// F100 criteria 1–5 — one AI read of reported content: Haiku first, Sonnet when
// Haiku is unsure. Pure of the database; the caller stores the result. Never
// throws: a failed or slow call leaves the report exactly as F078 handles it.
// What is sent is the content, the reporter's chosen reason and the poster's
// reply (criterion 4) — a photo goes as bytes, never as a URL, because a media
// URL carries its owner's id.

import { z } from 'zod'
import { ASSESS_CATEGORIES, RULES_TEXT, RULES_VERSION } from './rules'

export const HAIKU = 'claude-haiku-4-5-20251001'
export const SONNET = 'claude-sonnet-5-5'
/** F100 criterion 3: below this, Sonnet gives a second opinion. */
export const ESCALATION_THRESHOLD = 0.7
const TIMEOUT_MS = 20_000

export interface AssessInput {
  text: string
  image: { mediaType: string; base64: string } | null
  /** The label of the reason the reporter chose. */
  reporterReason: string
  /** The poster's reply, once F102 collects it. */
  rebuttal: string | null
  /** F102 criterion 12: Sonnet also reads a confident first read when this says so. Local; never sent. */
  secondOpinionIf?: (first: Read) => boolean
}

const verdictSchema = z.object({
  category: z.enum(ASSESS_CATEGORIES),
  severity: z.number().int().min(1).max(4),
  confidence: z.number().min(0).max(1),
  outcome: z.enum(['approve', 'remove']),
  reason: z.string().min(1),
})

export interface Read {
  model: string
  promptVersion: string
  category: (typeof ASSESS_CATEGORIES)[number]
  severity: number
  confidence: number
  outcome: 'approve' | 'remove'
  reason: string
  latencyMs: number
  inputTokens: number
  outputTokens: number
}

export interface Assessment {
  reads: Read[]
  /** The second read when there is one, else the first (criterion 3). */
  shown: Read
}

interface Deps {
  fetch?: typeof fetch
  env?: Record<string, string | undefined>
}

const TOOL = {
  name: 'assess',
  description: 'Record your assessment of the reported item.',
  input_schema: {
    type: 'object',
    properties: {
      category: { type: 'string', enum: [...ASSESS_CATEGORIES] },
      severity: { type: 'integer', minimum: 1, maximum: 4 },
      confidence: { type: 'number', minimum: 0, maximum: 1 },
      outcome: { type: 'string', enum: ['approve', 'remove'] },
      reason: { type: 'string', description: 'At most 140 characters.' },
    },
    required: ['category', 'severity', 'confidence', 'outcome', 'reason'],
  },
}

async function readOnce(model: string, input: AssessInput, { fetch: send = fetch, env = process.env }: Deps): Promise<Read | null> {
  const key = env.ANTHROPIC_API_KEY
  if (!key) return null
  const content: unknown[] = []
  if (input.image) {
    content.push({ type: 'image', source: { type: 'base64', media_type: input.image.mediaType, data: input.image.base64 } })
  }
  content.push({
    type: 'text',
    text: [
      `Reported item (text): ${input.text || '(none)'}`,
      `Reporter's chosen reason: ${input.reporterReason}`,
      input.rebuttal ? `Poster's reply: ${input.rebuttal}` : null,
    ]
      .filter(Boolean)
      .join('\n'),
  })
  const started = Date.now()
  try {
    const res = await send('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      body: JSON.stringify({
        model,
        max_tokens: 400,
        system: RULES_TEXT,
        tools: [TOOL],
        tool_choice: { type: 'tool', name: TOOL.name },
        messages: [{ role: 'user', content }],
      }),
    })
    if (!res.ok) return null
    const json = (await res.json()) as {
      content?: { type: string; input?: unknown }[]
      usage?: { input_tokens?: number; output_tokens?: number }
    }
    const block = json.content?.find((c) => c.type === 'tool_use')
    const parsed = verdictSchema.safeParse(block?.input)
    if (!parsed.success) return null
    return {
      model,
      promptVersion: RULES_VERSION,
      ...parsed.data,
      reason: parsed.data.reason.slice(0, 140),
      latencyMs: Date.now() - started,
      inputTokens: json.usage?.input_tokens ?? 0,
      outputTokens: json.usage?.output_tokens ?? 0,
    }
  } catch {
    return null
  }
}

export async function assessContent(input: AssessInput, deps: Deps = {}): Promise<Assessment | null> {
  const first = await readOnce(HAIKU, input, deps)
  if (!first) return null
  if (first.confidence >= ESCALATION_THRESHOLD && !input.secondOpinionIf?.(first)) return { reads: [first], shown: first }
  const second = await readOnce(SONNET, input, deps)
  return second ? { reads: [first, second], shown: second } : { reads: [first], shown: first }
}
