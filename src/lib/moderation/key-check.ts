// The operator's check that the moderation key works, without filing a fake report: one call to Anthropic's
// models list, which checks the key and spends no tokens. The key is never returned or logged.

type Env = Record<string, string | undefined>

export type KeyStatus = 'connected' | 'not_set' | 'rejected' | 'unreachable'

export async function checkModerationKey({ env = process.env, fetch: send = fetch }: { env?: Env; fetch?: typeof fetch } = {}): Promise<KeyStatus> {
  const key = env.ANTHROPIC_MODERATION_KEY?.trim()
  if (!key) return 'not_set'
  try {
    const res = await send('https://api.anthropic.com/v1/models?limit=1', {
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      signal: AbortSignal.timeout(8000),
    })
    if (res.ok) return 'connected'
    // Only these two say anything about the key; a 429 or a 500 is Anthropic, not the key.
    return res.status === 401 || res.status === 403 ? 'rejected' : 'unreachable'
  } catch {
    return 'unreachable'
  }
}
