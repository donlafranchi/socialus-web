import { describe, it, expect } from 'vitest'
import { safeNext } from './safe-next'

describe('safeNext', () => {
  it('keeps same-origin paths', () => {
    expect(safeNext('/onboarding')).toBe('/onboarding')
    expect(safeNext('/m/maya?tab=items')).toBe('/m/maya?tab=items')
  })

  it('rejects protocol-relative and backslash forms that resolve off-origin', () => {
    for (const hostile of ['//evil.com', '//evil.com/path', '/\\evil.com', '/\\\\evil.com']) {
      expect(safeNext(hostile)).toBe('/')
      // The guard is only meaningful if these really would escape the origin.
      expect(new URL(hostile, 'https://socialus.app').origin).not.toBe('https://socialus.app')
    }
  })

  it('rejects absolute URLs and non-path values', () => {
    expect(safeNext('https://evil.com')).toBe('/')
    expect(safeNext('javascript:alert(1)')).toBe('/')
    expect(safeNext('onboarding')).toBe('/')
  })

  it('handles empty input and honors the fallback', () => {
    expect(safeNext(null)).toBe('/')
    expect(safeNext(undefined)).toBe('/')
    expect(safeNext('')).toBe('/')
    expect(safeNext(null, '/onboarding')).toBe('/onboarding')
    expect(safeNext('//evil.com', '/onboarding')).toBe('/onboarding')
  })

  it('rejects a control character or whitespace that new URL() would strip into an off-site path (#400)', () => {
    expect(safeNext('/\t/evil.example')).toBe('/')
    expect(safeNext('/\n/evil.example')).toBe('/')
    expect(safeNext('/ok path')).toBe('/')
  })
})
