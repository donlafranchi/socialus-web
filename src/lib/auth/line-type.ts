// #570 (F081.9) — Twilio Lookup, Line Type Intelligence: refuse a non-fixed VoIP number (Google Voice
// and the like) before any code is sent. Env only. A stub until the Twilio keys exist (#707): with no
// credentials, or on any failure, it blocks nothing — an outage never locks a real person out.

type Env = Record<string, string | undefined>

export async function phoneIsBlocked(
  phone: string,
  { env = process.env, fetch: send = fetch }: { env?: Env; fetch?: typeof fetch } = {},
): Promise<boolean> {
  const sid = env.TWILIO_ACCOUNT_SID
  const token = env.TWILIO_AUTH_TOKEN
  if (!sid || !token || !/^\+1\d{10}$/.test(phone)) return false
  try {
    const res = await send(`https://lookups.twilio.com/v2/PhoneNumbers/${encodeURIComponent(phone)}?Fields=line_type_intelligence`, {
      headers: { Authorization: `Basic ${btoa(`${sid}:${token}`)}` },
    })
    if (!res.ok) {
      console.error(`[phone] line-type lookup refused: ${res.status}`)
      return false
    }
    const body = (await res.json()) as { line_type_intelligence?: { type?: string } | null }
    return body.line_type_intelligence?.type === 'nonFixedVoip'
  } catch (err) {
    console.error('[phone] line-type lookup failed:', err instanceof Error ? err.message : err)
    return false
  }
}
