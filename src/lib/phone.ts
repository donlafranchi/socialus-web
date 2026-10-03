// US phone numbers, however typed. Used for the member's signup phone (F081)
// and a Page's business phone (#293), which are different numbers.

/** Ten US digits as E.164; anything else is null. */
export function normalizeUsPhone(raw: string): string | null {
  let digits = raw.replace(/\D/g, '')
  if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1)
  if (digits.length !== 10 || !/^[2-9]/.test(digits)) return null
  return `+1${digits}`
}

/** "+19165550142" → "(916) 555-0142". */
export function formatUsPhone(e164: string): string {
  const d = e164.replace(/^\+1/, '')
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`
}
