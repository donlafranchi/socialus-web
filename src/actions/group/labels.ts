// #1180 — what a Page or post is listed under: labels from the shared list only (plan #273 B). The free tag box
// is gone, so a label outside the list is refused rather than made. A list label is a known, safe word, so it is
// written as reviewed and never waits in the tag review queue (#287).

import { z } from 'zod'
import { ValidationError } from '../_lib/errors'
import { MAX_TAGS_PER_PAGE, normalizeTag, TAG_MAX_LENGTH } from '../../lib/groups/tags'
import { countedPicks, isListLabel, toStoredTags } from '../../lib/labels/match'
import { MAX_PICKS } from '../../lib/labels/list'

export const labelsInput = z.array(z.string().max(TAG_MAX_LENGTH)).max(MAX_TAGS_PER_PAGE).optional()
/** The poster picked these under Change: never re-matched from the words. */
export const labelsPinnedInput = z.boolean().optional()

export const NOT_ON_LIST = 'Pick where it’s listed from the list.'
export const TOO_MANY = `Pick up to ${MAX_PICKS}.`

/** The labels to store, as list labels with their top labels. Refuses anything off the list. */
export function storedLabels(tags: readonly string[]): string[] {
  if (tags.some((t) => !isListLabel(t))) throw new ValidationError(NOT_ON_LIST)
  if (countedPicks(tags) > MAX_PICKS) throw new ValidationError(TOO_MANY)
  return toStoredTags(tags)
}

type Client = { query: (sql: string, params: unknown[]) => Promise<unknown> }

/** Makes sure each label's row exists in the vocabulary; returns their normalized keys. */
export async function ensureLabelRows(client: Client, labels: readonly string[], memberId: string): Promise<string[]> {
  const keys: string[] = []
  for (const label of labels) {
    const normalized = normalizeTag(label)
    await client.query(
      `insert into public.tags (label, normalized, created_by, review)
       values ($1, $2, $3, 'safe')
       on conflict (normalized) do update
         set label = excluded.label,
             review = case when public.tags.review = 'needs_review' then 'safe' else public.tags.review end`,
      [label, normalized, memberId],
    )
    keys.push(normalized)
  }
  return keys
}

/** Replaces a Page's labels with this set, in the caller's transaction. */
export async function writePageLabels(client: Client, groupId: string, labels: readonly string[], memberId: string) {
  const keys = await ensureLabelRows(client, labels, memberId)
  await client.query(
    `delete from public.page_tags pt
      using public.tags t
      where pt.tag_id = t.id
        and pt.group_id = $1
        and t.normalized <> all($2)`,
    [groupId, keys],
  )
  for (const normalized of keys) {
    await client.query(
      `insert into public.page_tags (group_id, tag_id)
       select $1, t.id from public.tags t where t.normalized = $2
       on conflict (group_id, tag_id) do nothing`,
      [groupId, normalized],
    )
  }
}

export async function writePagePinned(client: Client, groupId: string, pinned: boolean) {
  await client.query(`update public.groups set labels_pinned = $2 where id = $1`, [groupId, pinned])
}
