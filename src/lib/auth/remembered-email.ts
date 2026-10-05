// #332 — the last email used to sign in on this device, pre-filled next time.
// A convenience only: storage can be blocked, so every read and write may fail.

export const LAST_EMAIL_KEY = 'socialus:last-email'

export function rememberedEmail(): string {
  try {
    return localStorage.getItem(LAST_EMAIL_KEY) ?? ''
  } catch {
    return ''
  }
}

export function rememberEmail(email: string): void {
  try {
    localStorage.setItem(LAST_EMAIL_KEY, email)
  } catch {}
}
