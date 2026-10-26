// #945 — a reminder email to a member through Resend, from FOLLOW_EMAIL_FROM (a verified sending domain).
// Never throws. Unset key or sender: nothing is sent, and the caller treats the reminder as not delivered.

type Env = Record<string, string | undefined>

export function emailReady(env: Env = process.env): boolean {
  return Boolean(env.RESEND_API_KEY && env.FOLLOW_EMAIL_FROM)
}

export async function sendMemberEmail(
  to: string,
  subject: string,
  text: string,
  { env = process.env, fetch: send = fetch, unsubscribe }: { env?: Env; fetch?: typeof fetch; unsubscribe?: string } = {},
): Promise<boolean> {
  if (!emailReady(env)) return false
  try {
    const res = await send('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: env.FOLLOW_EMAIL_FROM, to: [to], subject, text, ...(unsubscribe ? { headers: { 'List-Unsubscribe': `<${unsubscribe}>` } } : {}) }),
    })
    if (!res.ok) console.error(`[notify] reminder email refused: ${res.status}`)
    return res.ok
  } catch (err) {
    console.error('[notify] reminder email failed:', err instanceof Error ? err.message : err)
    return false
  }
}
