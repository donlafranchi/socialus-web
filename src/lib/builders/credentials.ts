// #280 — builder accounts on the live app. Every password derives from one
// secret, BUILDER_SEED, held in GitHub secrets and Don's private env only;
// nothing here or in the repo can produce one without it.

import { createHmac } from 'node:crypto'
import { PERSONAS, type PersonaKey } from '../../../evals/personas'

export const BUILDER_PERSONAS: PersonaKey[] = PERSONAS.map((p) => p.key).filter((k) => k !== 'signedOut')

export const DEFAULT_BUILDER_EMAIL = 'builder+{persona}@socialus.org'

export function builderPassword(seed: string, persona: PersonaKey): string {
  if (!seed || seed.length < 16) throw new Error('BUILDER_SEED is missing or shorter than 16 characters')
  return createHmac('sha256', seed).update(`builder:${persona}`).digest('base64url')
}

export function builderEmail(persona: PersonaKey, template = DEFAULT_BUILDER_EMAIL): string {
  return template.replace('{persona}', persona.toLowerCase())
}
