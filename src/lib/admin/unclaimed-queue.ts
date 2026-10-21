// #353 — the operator's view of unclaimed Pages: each one's source log and the
// claim and removal requests it has had. Server-side over DATABASE_URL; the
// three tables have no client policy and must not gain one.

import { getPool } from '@/actions/_lib/db'

export interface UnclaimedSource {
  field: string
  url: string
  capturedOn: string
  capturedBy: string
}

export interface UnclaimedRequest {
  kind: 'claim' | 'removal' | 'photo removal'
  name: string | null
  contact: string
  text: string | null
  createdAt: Date
}

export interface UnclaimedPageRow {
  groupId: string
  publicId: string
  name: string
  hiddenAt: Date | null
  photoHiddenAt: Date | null
  sources: UnclaimedSource[]
  requests: UnclaimedRequest[]
  /** #987 — claims with proof waiting for a decision: the one case a person decides. */
  proofClaims: ProofClaim[]
}

export interface ProofClaim {
  id: string
  handle: string
  proofUrl: string
  note: string | null
  createdAt: Date
}

export async function fetchUnclaimedPages(): Promise<UnclaimedPageRow[]> {
  const { rows } = await getPool().query<{
    id: string
    public_id: string
    name: string
    unclaimed_hidden_at: Date | null
    photo_hidden_at: Date | null
    sources: UnclaimedSource[] | null
    requests: (Omit<UnclaimedRequest, 'createdAt'> & { createdAt: string })[] | null
    proof_claims: (Omit<ProofClaim, 'createdAt'> & { createdAt: string })[] | null
  }>(
    `select g.id, g.public_id, coalesce(b.display_name, g.name, g.slug) as name, g.unclaimed_hidden_at, g.photo_hidden_at,
            (select json_agg(json_build_object('field', s.field, 'url', s.url, 'capturedOn', s.captured_on,
                                               'capturedBy', s.captured_by) order by s.created_at)
               from public.page_sources s where s.group_id = g.id) as sources,
            (select json_agg(r order by r."createdAt" desc) from (
               select case scope when 'photo' then 'photo removal' else 'removal' end as kind, null as name, contact, reason as text, created_at as "createdAt"
                 from public.page_removal_requests where group_id = g.id
               union all
               select 'claim', name, contact, message, created_at
                 from public.page_claim_requests where group_id = g.id) r) as requests,
            (select json_agg(json_build_object('id', c.id, 'handle', m.handle, 'proofUrl', c.proof_url, 'note', c.proof_note,
                                               'createdAt', c.created_at) order by c.created_at)
               from public.page_claims c join public.members m on m.id = c.claimant_member_id
              where c.group_id = g.id and c.status = 'review') as proof_claims
       from public.groups g
       left join public.group_businesses b on b.group_id = g.id
      where g.unclaimed_at is not null
      order by g.unclaimed_hidden_at desc nulls last, name`,
  )
  return rows.map((r) => ({
    groupId: r.id,
    publicId: r.public_id,
    name: r.name,
    hiddenAt: r.unclaimed_hidden_at,
    photoHiddenAt: r.photo_hidden_at,
    sources: r.sources ?? [],
    requests: (r.requests ?? []).map((q) => ({ ...q, createdAt: new Date(q.createdAt) })),
    proofClaims: (r.proof_claims ?? []).map((c) => ({ ...c, createdAt: new Date(c.createdAt) })),
  }))
}
