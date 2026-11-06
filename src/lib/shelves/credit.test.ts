// F121 criterion 11 — a save counts for the shelf the card was tapped on.
import { describe, it, expect } from 'vitest'
import { rememberShelfTap, takeShelfCredit } from './credit'

const store = () => {
  const m = new Map<string, string>()
  return { setItem: (k: string, v: string) => void m.set(k, v), getItem: (k: string) => m.get(k) ?? null, removeItem: (k: string) => void m.delete(k) }
}

describe('F121 — crediting a save to its shelf', () => {
  it('credits the shelf once, on the tapped card’s page or its Page, within 30 minutes', () => {
    const s = store()
    rememberShelfTap(s, 'next-7-days', '/sacramento-ca/plant-foundry/fall-plant-sale?x=1', 1000)
    expect(takeShelfCredit(s, '/sacramento-ca/other-place', 2000)).toBeNull()
    expect(takeShelfCredit(s, '/sacramento-ca/plant-foundry', 2000)).toBe('next-7-days')
    expect(takeShelfCredit(s, '/sacramento-ca/plant-foundry', 3000)).toBeNull()
  })

  it('a save more than 30 minutes later, or with no tap, credits nothing', () => {
    const s = store()
    expect(takeShelfCredit(s, '/a/b', 0)).toBeNull()
    rememberShelfTap(s, 'lend-a-hand', '/a/b/c', 0)
    expect(takeShelfCredit(s, '/a/b/c', 31 * 60_000)).toBeNull()
  })
})
