// F118 — the board, cached for an hour: one figure for every reader, never recomputed in answer
// to the reader's own action (F076 criterion 14).

import { unstable_cache } from 'next/cache'
import { getPool } from '@/actions/_lib/db'
import { sortBoard, type Contributor, type TownRow } from './towns'

export const BOARD_SECONDS = 3600

export const cachedBoard = unstable_cache(
  async (): Promise<TownRow[]> => {
    const { rows } = await getPool().query<TownRow>(`select * from public.town_board()`)
    return sortBoard(rows.map((r) => ({ ...r, ready_at: r.ready_at ? String(r.ready_at) : null })))
  },
  ['town-board'],
  { revalidate: BOARD_SECONDS },
)

export const cachedContributors = unstable_cache(
  async (slug: string): Promise<Contributor[]> => (await getPool().query<Contributor>(`select * from public.town_contributors($1)`, [slug])).rows,
  ['town-contributors'],
  { revalidate: BOARD_SECONDS },
)
