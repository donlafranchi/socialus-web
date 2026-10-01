// #269 — signs each seeded persona in once, through the same password page
// the existing evals use, and keeps the session for the matrix to reuse.
import { test as setup } from '@playwright/test'
import { PERSONAS, PERSONA_PASSWORD } from '../personas'
import { signIn } from '../helpers/auth'

export const authFile = (key: string) => `evals/.auth/${key}.json`

for (const who of PERSONAS.filter((p) => p.email)) {
  setup(`sign in ${who.key}`, async ({ page }) => {
    await signIn(page, who.email!, PERSONA_PASSWORD)
    await page.context().storageState({ path: authFile(who.key) })
  })
}
