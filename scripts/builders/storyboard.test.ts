// #346 — the storyboard lays each journey out in order, one caption per frame.
import { describe, it, expect } from 'vitest'
import { storyboard } from './storyboard'

const shots = [
  { kind: 'business', org: 'Kiln & Clay', n: 2, caption: 'Lands on the draft Page', file: 'business/kiln-02.png' },
  { kind: 'business', org: 'Kiln & Clay', n: 1, caption: 'Create asks one question', file: 'business/kiln-01.png' },
]

describe('#346 — storyboard', () => {
  it('orders frames and captions them', () => {
    const html = storyboard(shots, [], '2026-10-05')
    expect(html.indexOf('1. Create asks one question')).toBeLessThan(html.indexOf('2. Lands on the draft Page'))
    expect(html).toContain('Kiln &amp; Clay')
    expect(html).toContain('src="business/kiln-01.png"')
  })

  it('shows where a run got stuck', () => {
    const html = storyboard(shots, [{ kind: 'business', org: 'Kiln & Clay', step: 'Where it is', what: 'stuck', detail: 'no option' }], 'd')
    expect(html).toContain('<b>Where it is</b> — stuck: no option')
  })

  it('escapes what it prints', () => {
    expect(storyboard([{ ...shots[0]!, caption: '<script>' }], [], 'd')).not.toContain('<script>')
  })
})
