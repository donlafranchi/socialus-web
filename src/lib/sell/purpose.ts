// F087 (draft) — the create flow asks what you are making before anything else.
//
// Don's words, 2026-09-15: "What are we creating? Are you opening up a shop,
// or are you offering a service, or are you creating a group for meetup?"
//
// Underneath, all three make a Page. **The person never sees the word Page** —
// Don ruled that directly. `nouns.md` keeps Page as the name the docs and the
// code check each other against; this file is the layer that turns it back
// into the words someone actually used when they answered the question.
//
// WHAT THE CHOICE DOES TODAY: it selects the words, at every step after it.
// WHAT IT DOES NOT DO TODAY: change which steps you see, which tools you get,
// or what is written to the database. That is F087 criterion 4 and is a real
// feature, not a copy pass.
//
// It also does not set `groups.kind`, deliberately and for two reasons.
// F087 criterion 6 says the purpose "confers no permanent kind". And
// `resolveShop` filters `.eq('kind', 'business')`, so a Page created as any
// other kind would not resolve at its own URL — the choice would ship a
// 404 for two answers out of three.

export const PURPOSES = ['shop', 'service', 'group'] as const
export type Purpose = (typeof PURPOSES)[number]

interface PurposeCopy {
  /** The answer, as the person picks it. Don's phrasing. */
  choice: string
  /** The noun that replaces "shop" everywhere downstream. */
  noun: string
}

export const PURPOSE_COPY: Record<Purpose, PurposeCopy> = {
  shop: { choice: 'Opening a shop', noun: 'shop' },
  service: { choice: 'Offering a service', noun: 'service' },
  group: { choice: 'Creating a group for meetups', noun: 'group' },
}

/** The noun for a purpose, defaulting to shop for a resumed pre-F087 draft. */
export function nounFor(purpose: Purpose | null): string {
  return PURPOSE_COPY[purpose ?? 'shop'].noun
}
