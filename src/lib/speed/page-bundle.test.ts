// #527 — a visitor opening a Page downloaded the whole map library (480 KB
// compressed, 650 ms on 4G), though the Page draws its map as a still image.
// The owner's composer pulled it in. Follow static imports from the Page route;
// mapbox-gl must not be on the path (a dynamic import() is off it).
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'

const SRC = join(__dirname, '..', '..')
const EXTS = ['', '.ts', '.tsx', '/index.ts', '/index.tsx']

function resolve(from: string, spec: string): string | null {
  const base = spec.startsWith('@/') ? join(SRC, spec.slice(2)) : spec.startsWith('.') ? join(dirname(from), spec) : null
  if (!base) return null
  for (const e of EXTS) if (existsSync(base + e) && /\.(tsx?)$/.test(base + e)) return base + e
  return null
}

function reaches(entry: string, target: string): string[] | null {
  const seen = new Set<string>()
  const walk = (file: string, path: string[]): string[] | null => {
    if (seen.has(file)) return null
    seen.add(file)
    const text = readFileSync(file, 'utf8')
    for (const m of text.matchAll(/^(?:import|export)\s[^'"]*?from\s+['"]([^'"]+)['"]|^import\s+['"]([^'"]+)['"]/gm)) {
      const spec = m[1] ?? m[2]!
      if (spec === target) return [...path, file.replace(SRC, 'src'), target]
      const next = resolve(file, spec)
      if (next) {
        const hit = walk(next, [...path, file.replace(SRC, 'src')])
        if (hit) return hit
      }
    }
    return null
  }
  return walk(entry, [])
}

describe('what a visitor downloads to open a Page', () => {
  it('does not include the map library', () => {
    const hit = reaches(join(SRC, 'app/g/[handle]/page.tsx'), 'mapbox-gl')
    expect(hit, `mapbox-gl is statically imported along: ${hit?.join(' → ')}`).toBeNull()
  })
  it('the walker can find an import that is there (it is not blind)', () => {
    expect(reaches(join(SRC, 'components/locations/PinAdjustMap.tsx'), 'mapbox-gl')).not.toBeNull()
  })
})
