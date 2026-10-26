// #713 — the app storyboard: every 390px screen, grouped by area, one strip per persona.
import { describe, it, expect } from 'vitest'
import { appSections, appStoryboard, areaOf } from './storyboard-app'

const files = [
  'member/explore.png',
  'signedOut/explore.png',
  'signedOut/auth-login.png',
  'member/report-sheet.png',
  'member/page.png',
  'member/root.png',
  'signedOut/not-a-route.png',
  'member/explore.txt',
]

describe('#713 — app storyboard', () => {
  it('places routes in areas, unknown ones last', () => {
    expect(areaOf('explore-map')).toBe('Explore and map')
    expect(areaOf('page-edit')).toBe('Pages')
    expect(areaOf('report-sent')).toBe('Report and moderation')
    expect(areaOf('you-settings-tab')).toBe('Sign in and You')
    expect(areaOf('not-a-route')).toBe('Other')
  })

  it('groups by area, then persona, with routes in routes.ts order', () => {
    const s = appSections(files)
    expect(s.map((x) => `${x.heading}/${x.sub}`)).toEqual([
      'Explore and map/signedOut',
      'Explore and map/member',
      'Pages/member',
      'Report and moderation/member',
      'Sign in and You/signedOut',
      'Other/signedOut',
    ])
    expect(s[1]!.frames.map((f) => f.src)).toEqual(['390/member/root.png', '390/member/explore.png'])
  })

  it('narrows to the given routes', () => {
    const s = appSections(files, new Set(['explore']))
    expect(s.flatMap((x) => x.frames.map((f) => f.caption))).toEqual(['explore', 'explore'])
  })

  it('renders one plain page with every picture', () => {
    const html = appStoryboard(appSections(files), '2026-10-12')
    expect(html).toContain('<h2>Explore and map <span>member</span></h2>')
    expect(html).toContain('src="390/member/report-sheet.png"')
    expect(html).not.toContain('.txt')
  })
})
