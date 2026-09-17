// Who may see a verification page.
//
// A pure function so it can be tested both ways. The rule it encodes is
// narrow and the inversion matters:
//
//   BLOCK only when Vercel says this deployment IS production.
//
// Not "allow when NODE_ENV is development", which is what this used to be.
// That read correctly on a laptop and wrongly everywhere else: every Vercel
// build — preview and production alike — runs with NODE_ENV=production, so a
// verification page rendered for whoever was sitting at the machine and 404'd
// for the person who actually needed to look at it. Don works from his phone,
// away from the machine, so that was exactly backwards.
//
// VERCEL_ENV is the variable that distinguishes them: 'production' | 'preview'
// | 'development'. It is unset outside Vercel, which is why the test is for
// equality with 'production' rather than inequality with anything — an unset
// value must mean "not production", so `next dev` and `next start` on a laptop
// keep working.

export function isProductionDeployment(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return env.VERCEL_ENV === 'production'
}
