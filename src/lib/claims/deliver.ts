// #987 — delivers a claim code: email through Resend (as reminders do), text through Twilio (behind CLAIM_BY_PHONE,
// parked until texting is live). Never throws; false means the claimant is told it did not go through.
import { sendMemberEmail } from '@/lib/notify/email'
import { COPY } from '@/lib/copy'

type Env = Record<string, string | undefined>

export async function sendClaimCode(
  claim: { method: 'email' | 'phone'; target: string; code: string; pageName: string },
  { env = process.env, fetch: send = fetch }: { env?: Env; fetch?: typeof fetch } = {},
): Promise<boolean> {
  const text = COPY.claimCodeBody(claim.code, claim.pageName)
  if (claim.method === 'email') return sendMemberEmail(claim.target, COPY.claimCodeSubject(claim.pageName), text, { env, fetch: send })
  const { TWILIO_ACCOUNT_SID: sid, TWILIO_AUTH_TOKEN: token, TWILIO_FROM_NUMBER: from } = env
  if (!sid || !token || !from) return false
  try {
    const res = await send(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: { Authorization: `Basic ${btoa(`${sid}:${token}`)}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ To: claim.target, From: from, Body: text }).toString(),
    })
    return res.ok
  } catch {
    return false
  }
}
