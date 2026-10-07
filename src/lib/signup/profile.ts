// #222 (F081) — what signup collects, and nothing else: legal name, zip and
// display name (the email is the login), plus the 18+ confirmation. The legal
// name and the zip are seen only by operators; the display name is public.
// Messages are placeholders ([public-is-draft]).

export interface SignupProfileInput {
  legalName: string
  displayName: string
  zip: string
  adultConfirmed: boolean
}

export type SignupProfileField = keyof SignupProfileInput

export type SignupProfileResult =
  | { ok: true; value: SignupProfileInput }
  | { ok: false; field: SignupProfileField; message: string }

const ZIP = /^\d{5}$/

export function validateSignupProfile(input: SignupProfileInput): SignupProfileResult {
  const legalName = input.legalName?.trim() ?? ''
  const displayName = input.displayName?.trim() ?? ''
  const zip = input.zip?.trim() ?? ''
  if (legalName.length < 2 || legalName.length > 120) {
    return { ok: false, field: 'legalName', message: 'Add your full legal name.' }
  }
  if (displayName.length < 1 || displayName.length > 60) {
    return { ok: false, field: 'displayName', message: 'Add a display name (1–60 characters).' }
  }
  if (!ZIP.test(zip)) {
    return { ok: false, field: 'zip', message: 'Enter a 5-digit zip code.' }
  }
  if (input.adultConfirmed !== true) {
    return { ok: false, field: 'adultConfirmed', message: 'Please confirm you are 18 or older.' }
  }
  return { ok: true, value: { legalName, displayName, zip, adultConfirmed: true } }
}
