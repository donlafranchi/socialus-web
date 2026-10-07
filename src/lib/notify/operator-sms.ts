// F078 criterion 5 — a sensitive-content or threat-of-harm report texts Don
// at once. Twilio's REST API; the account, number and Don's phone are env
// only. Never throws: the report and the hide already stand without it.

type Env = Record<string, string | undefined>

export async function textOperator(
  message: string,
  { env = process.env, fetch: send = fetch }: { env?: Env; fetch?: typeof fetch } = {},
): Promise<{ sent: boolean }> {
  const sid = env.TWILIO_ACCOUNT_SID
  const token = env.TWILIO_AUTH_TOKEN
  const from = env.TWILIO_FROM_NUMBER
  const to = env.OPERATOR_PHONE
  if (!sid || !token || !from || !to) {
    console.warn('[notify] operator text not sent: TWILIO_* or OPERATOR_PHONE is not set')
    return { sent: false }
  }
  try {
    const res = await send(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${btoa(`${sid}:${token}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: to, From: from, Body: message }).toString(),
    })
    if (!res.ok) {
      console.error(`[notify] operator text refused: ${res.status}`)
      return { sent: false }
    }
    return { sent: true }
  } catch (err) {
    console.error('[notify] operator text failed:', err instanceof Error ? err.message : err)
    return { sent: false }
  }
}
