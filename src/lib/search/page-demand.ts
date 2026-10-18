// #909 — what locals near a Page searched this month, for its managers only. page_search_demand checks who is
// asking and returns only terms searched 3 or more times; the minimum is enforced again here.
import type { SupabaseClient } from '@supabase/supabase-js'

export const DEMAND_MIN_SEARCHES = 3

export interface DemandTerm {
  query: string
  searches: number
}
export interface PageSearchDemand {
  fit: DemandTerm[]
  zero: DemandTerm[]
}

export async function loadPageSearchDemand(supabase: Pick<SupabaseClient, 'rpc'>, groupId: string): Promise<PageSearchDemand | null> {
  try {
    const { data, error } = await supabase.rpc('page_search_demand', { p_group_id: groupId })
    if (error || !Array.isArray(data)) return null
    const rows = (data as { list: string; query: string; searches: number }[]).filter((r) => r.searches >= DEMAND_MIN_SEARCHES)
    const pick = (list: string) => rows.filter((r) => r.list === list).map(({ query, searches }) => ({ query, searches }))
    const demand = { fit: pick('fit'), zero: pick('zero') }
    return demand.fit.length || demand.zero.length ? demand : null
  } catch {
    return null
  }
}
