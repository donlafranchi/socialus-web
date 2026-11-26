// VN-0001 read "…holds the opening.." (2026-11-26): the plan line adds a full stop only where one is missing.
import { describe, it, expect } from 'vitest'
import { endSentence } from '@/lib/knowledge/plans'

describe('endSentence', () => {
  it('adds a full stop only when the words lack one', () => {
    expect(endSentence('nothing below the cut line holds the opening.')).toBe('nothing below the cut line holds the opening.')
    expect(endSentence('Must-haves only')).toBe('Must-haves only.')
    expect(endSentence('Open now?  ')).toBe('Open now?')
    expect(endSentence('as ruled (D-0416)')).toBe('as ruled (D-0416).')
  })
})
