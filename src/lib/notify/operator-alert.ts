// F078 criterion 5 — an urgent report (Threat of harm, Sensitive content) alerts the operator at once.
// By text once the Twilio values exist, automatically; until then, or if the text is refused, by email
// through Resend to ADMIN_EMAILS, so nothing waits on a number (Dispatch call, 2026-10-12, #707).
// Never throws: the report and the hide already stand without it.

import { textOperator } from './operator-sms'

type Env = Record<string, string | undefined>

export type AlertResult = { sent: true; via: 'sms' | 'email' } | { sent: false; via: null }

export async function alertOperator(
  message: string,
  { env = process.env, fetch: send = fetch }: { env?: Env; fetch?: typeof fetch } = {},
): Promise<AlertResult> {
  const smsReady = Boolean(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_FROM_NUMBER && env.OPERATOR_PHONE)
  if (smsReady && (await textOperator(message, { env, fetch: send })).sent) return { sent: true, via: 'sms' }
  if (await emailOperator(message, { env, fetch: send })) return { sent: true, via: 'email' }
  if (!smsReady) console.warn('[notify] operator alert not sent: set TWILIO_* and OPERATOR_PHONE, or RESEND_API_KEY and ADMIN_EMAILS')
  return { sent: false, via: null }
}

async function emailOperator(message: string, { env, fetch: send }: { env: Env; fetch: typeof fetch }): Promise<boolean> {
  const key = env.RESEND_API_KEY
  const to = (env.ADMIN_EMAILS ?? '').split(',').map((a) => a.trim()).filter(Boolean)
  if (!key || to.length === 0) return false
  try {
    const res = await send('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: env.FOLLOW_EMAIL_FROM || 'SocialUs <onboarding@resend.dev>', to, subject: 'SocialUs: an urgent report came in', text: message }),
    })
    if (!res.ok) {
      console.error(`[notify] operator email refused: ${res.status}`)
      return false
    }
    return true
  } catch (err) {
    console.error('[notify] operator email failed:', err instanceof Error ? err.message : err)
    return false
  }
}
