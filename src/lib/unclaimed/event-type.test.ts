import { describe, expect, it } from 'vitest'
import { classifyEvent, EVENT_INTERESTS } from './event-type'

describe('classifyEvent', () => {
  it.each([
    ['Grizzlies vs Kings', 'sports'],
    ['Sacramento Kings v. Lakers', 'sports'],
    ['WWE Friday Night SmackDown', 'sports'],
    ['Sacramento River Cats Opening Day', 'sports'],
    ['Disney On Ice: Magic in the Stars', 'family'],
    ['Paw Patrol Live!', 'family'],
    ['Nate Bargatze: Stand-Up Tour', 'comedy'],
    ['Comedy Night with Open Mic', 'comedy'],
    ['The Nutcracker', 'theater'],
    ['Sacramento Philharmonic Symphony', 'theater'],
  ])('%s is %s', (title, type) => expect(classifyEvent(title, [])).toBe(type))

  it('does not take a band with a team word in its name for a game', () => {
    expect(classifyEvent('Kings of Leon', ['Live music'])).toBe('music')
  })
  it('falls back to the venue: a music venue\'s unknown act is music', () => {
    expect(classifyEvent('Karan Aujla', ['Live music', 'Arts & culture'])).toBe('music')
  })
  it('says other when neither the title nor the venue tells', () => {
    expect(classifyEvent('Annual Gathering', ['Local business'])).toBe('other')
  })
})

describe('EVENT_INTERESTS', () => {
  it('maps sports to a vocabulary interest and nothing for other', () => {
    expect(EVENT_INTERESTS.sports).toContain('Fitness & outdoors')
    expect(EVENT_INTERESTS.music).toEqual(['Live music'])
    expect(EVENT_INTERESTS.other).toEqual([])
  })
})
