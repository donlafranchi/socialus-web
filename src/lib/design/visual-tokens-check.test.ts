// #295 — the check itself, on fixtures.
import { describe, it, expect } from 'vitest'
import { checkVisualTokens, oneOffs } from './visual-tokens-check'

describe('#295 — one-off visual values', () => {
  it('finds arbitrary sizes, spacing, radius, shadow and type, and inline px', () => {
    const src = `<div className="p-[13px] rounded-[10px] text-[15px] shadow-[0_1px_2px_#000] -mt-[3px]" style={{ fontSize: '14px' }} />`
    expect(oneOffs(src)).toEqual(
      ['-mt-[3px]', 'fontSize:14px', 'p-[13px]', 'rounded-[10px]', 'shadow-[0_1px_2px_#000]', 'text-[15px]'].sort(),
    )
  })

  it('leaves colour and tokens alone', () => {
    const src = `<p className="text-[var(--color-fg)] bg-[var(--color-surface)] rounded-md p-4 text-body-sm min-h-tap" />`
    expect(oneOffs(src)).toEqual([])
  })

  it('does not mistake a media query for an inline length', () => {
    expect(oneOffs(`useMediaQuery('(min-width: 1024px)')`)).toEqual([])
  })

  it('fails a one-off the baseline does not list', () => {
    expect(checkVisualTokens({ 'a.tsx': '<i className="p-[13px]" />' }, {})).toEqual([
      { file: 'a.tsx', value: 'p-[13px]', kind: 'new one-off' },
    ])
  })

  it('passes one the baseline lists, count for count', () => {
    const file = '<i className="p-[13px]" /><b className="p-[13px]" />'
    expect(checkVisualTokens({ 'a.tsx': file }, { 'a.tsx': ['p-[13px]', 'p-[13px]'] })).toEqual([])
    expect(checkVisualTokens({ 'a.tsx': file }, { 'a.tsx': ['p-[13px]'] })).toHaveLength(1)
  })

  it('fails a baseline entry the tree no longer has, so the list only shrinks', () => {
    expect(checkVisualTokens({ 'a.tsx': '<i className="p-4" />' }, { 'a.tsx': ['p-[13px]'] })).toEqual([
      { file: 'a.tsx', value: 'p-[13px]', kind: 'stale baseline entry' },
    ])
  })
})
