// #993 — the overnight smoke failed on the operator's You screen: "TypeError: Failed to fetch", twice.
// At 390px the "Your Pages" list was still loading when the smoke reloaded the page for 1280px;
// the browser aborts the two in-flight reads and each logs that error. Nobody sees it. A
// "Failed to fetch" with no navigation-aborted request behind it is still a problem.

import { describe, it, expect } from 'vitest'
import { abortedByNavigation } from './aborted-fetch'

describe('abortedByNavigation', () => {
  it('ignores "Failed to fetch" when a request was aborted by a navigation', () => {
    expect(abortedByNavigation('TypeError: Failed to fetch', 2)).toBe(true)
  })
  it('keeps "Failed to fetch" when nothing was aborted: a real network failure', () => {
    expect(abortedByNavigation('TypeError: Failed to fetch', 0)).toBe(false)
  })
  it('never ignores a different error, aborted request or not', () => {
    expect(abortedByNavigation('TypeError: x is undefined', 3)).toBe(false)
  })
})
