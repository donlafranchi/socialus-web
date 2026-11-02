'use client'

// #1171 — the signed-in member's own hearts and saves, read once per page load through RLS (a member reads only
// their own rows) and shared by every card, so a post hearted in one shelf shows hearted in the next.
// Signed out, the store stays empty and the buttons stay hidden.

import { useSyncExternalStore } from 'react'
import { createClient } from '@/lib/supabase'

export interface Marks {
  /** null until we know; false signed out. */
  signedIn: boolean | null
  heartedPosts: ReadonlySet<string>
  heartedPages: ReadonlySet<string>
  savedPosts: ReadonlySet<string>
}

const EMPTY: Marks = { signedIn: null, heartedPosts: new Set(), heartedPages: new Set(), savedPosts: new Set() }
let state: Marks = EMPTY
let loading: Promise<void> | null = null
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

export function setMarks(next: Partial<Marks>) {
  state = { ...state, ...next }
  emit()
}

async function load() {
  const supabase = createClient()
  const { data } = await supabase.auth.getUser()
  if (!data.user) return setMarks({ signedIn: false })
  const [hearts, saves] = await Promise.all([supabase.from('hearts').select('post_id, group_id'), supabase.from('saves').select('post_id')])
  const rows = (hearts.data ?? []) as { post_id: string | null; group_id: string | null }[]
  setMarks({
    signedIn: true,
    heartedPosts: new Set(rows.flatMap((r) => (r.post_id ? [r.post_id] : []))),
    heartedPages: new Set(rows.flatMap((r) => (r.group_id ? [r.group_id] : []))),
    savedPosts: new Set(((saves.data ?? []) as { post_id: string }[]).map((r) => r.post_id)),
  })
}

function subscribe(l: () => void) {
  listeners.add(l)
  loading ??= load().catch(() => setMarks({ signedIn: false }))
  return () => listeners.delete(l)
}

export function useMarks(): Marks {
  return useSyncExternalStore(subscribe, () => state, () => EMPTY)
}

/** Flip one mark in place (optimistic); returns the undo. */
export function flip(kind: 'heartedPosts' | 'heartedPages' | 'savedPosts', id: string, on: boolean): () => void {
  const next = new Set(state[kind])
  if (on) next.add(id)
  else next.delete(id)
  const before = state[kind]
  setMarks({ [kind]: next })
  return () => setMarks({ [kind]: before })
}

/** For tests. */
export function resetMarks(next: Partial<Marks> = {}) {
  state = { ...EMPTY, ...next }
  loading = next.signedIn === undefined ? null : Promise.resolve()
  emit()
}
