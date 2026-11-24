// #296 — no header or ➕ on sign-in, onboarding or admin: each is a flow or a tool, and
// chrome is a way out of the thing you are meant to finish. #358 — nor on a
// full-height edit screen (the 2026-10-01 ruling), where it covered Save.
// `/` is the signed-out front door, which carries its own header and footer.
const NO_NAV = [/^\/$/, /^\/auth(\/|$)/, /^\/onboarding(\/|$)/, /^\/welcome(\/|$)/, /^\/join\/.+/, /^\/admin(\/|$)/, /^\/g\/[^/]+\/edit(\/|$)/]
export const navHidden = (pathname: string | null) => NO_NAV.some((r) => r.test(pathname ?? '/'))
