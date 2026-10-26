// #904 — what each change to a member's choices adds to the week's counts (no member is recorded).
import { describe, it, expect } from 'vitest'
import { countsFor } from './notifications'
import { DEFAULT_PREFS } from '@/lib/notify/push/rules'

const OFF = DEFAULT_PREFS
const BOTH = { ...OFF, followPosts: true, weekend: true }

describe('countsFor', () => {
  it('turning a kind on is an opt-in for that kind only', () => {
    expect(countsFor(OFF, { ...OFF, weekend: true })).toEqual([{ kind: 'weekend', field: 'opt_ins' }])
  })
  it('turning a kind off is an unsubscribe', () => {
    expect(countsFor(BOTH, { ...BOTH, followPosts: false })).toEqual([{ kind: 'follow_posts', field: 'unsubscribes' }])
  })
  it('pause all is a mute of each kind that was on', () => {
    expect(countsFor({ ...OFF, followPosts: true }, { ...OFF, followPosts: true, paused: true })).toEqual([{ kind: 'follow_posts', field: 'mutes' }])
  })
  it('quiet hours and un-pausing count nothing', () => {
    expect(countsFor(BOTH, { ...BOTH, quietStart: 22 })).toEqual([])
    expect(countsFor({ ...BOTH, paused: true }, BOTH)).toEqual([])
  })
})
