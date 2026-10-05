// #346 — what a builder run leaves behind: numbered screenshots with a caption
// each (the storyboard reads these), and a friction log of every step that got
// stuck, errored or ran slow.

import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Page } from '@playwright/test'

export const RUN_DIR = process.env.BUILDER_OUT ?? join('builder-runs', new Date().toISOString().slice(0, 10))
const MANIFEST = join(RUN_DIR, 'manifest.json')
const SLOW_MS = 8_000

export interface Shot { kind: string; org: string; n: number; caption: string; file: string }
export interface Friction { kind: string; org: string; step: string; what: string; detail: string; shot?: string }
interface Manifest { shots: Shot[]; friction: Friction[]; pages: Record<string, { kind: string; href: string }> }

function load(): Manifest {
  mkdirSync(RUN_DIR, { recursive: true })
  return existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')) : { shots: [], friction: [], pages: {} }
}
function save(m: Manifest) {
  writeFileSync(MANIFEST, JSON.stringify(m, null, 2))
  writeFileSync(join(RUN_DIR, 'friction.md'), frictionMarkdown(m.friction))
}

export function frictionMarkdown(f: Friction[]): string {
  if (f.length === 0) return '# Friction log\n\nNothing got stuck.\n'
  return ['# Friction log', '', ...f.map((x) => `- **${x.kind} · ${x.org} · ${x.step}** — ${x.what}: ${x.detail}${x.shot ? ` ([shot](${x.shot}))` : ''}`), ''].join('\n')
}

export function recordPage(name: string, kind: string, href: string) {
  const m = load()
  m.pages[name] = { kind, href }
  save(m)
}
export const knownPages = () => load().pages

/** One storyboard frame per org, numbered in journey order. */
export class Journey {
  private n = 0
  stuck = false
  constructor(private page: Page, readonly kind: string, readonly org: string) {}

  async shot(caption: string) {
    const m = load()
    const file = join(this.kind, `${slug(this.org)}-${String(++this.n).padStart(2, '0')}.png`)
    mkdirSync(join(RUN_DIR, this.kind), { recursive: true })
    await this.page.screenshot({ path: join(RUN_DIR, file), fullPage: false })
    m.shots.push({ kind: this.kind, org: this.org, n: this.n, caption, file })
    save(m)
    return file
  }

  /** Runs a step; a failure or a slow step is friction, never a crash. */
  async step(name: string, caption: string | null, fn: () => Promise<void>): Promise<boolean> {
    if (this.stuck) return false
    const started = Date.now()
    try {
      await fn()
      const took = Date.now() - started
      if (took > SLOW_MS) this.friction(name, 'slow', `took ${Math.round(took / 1000)}s`)
      if (caption) await this.shot(caption)
      return true
    } catch (err) {
      const shot = await this.shot(`Stuck: ${name}`).catch(() => undefined)
      this.friction(name, 'stuck', (err as Error).message.split('\n')[0]!.slice(0, 300), shot)
      return false
    }
  }

  /** Something a person would find confusing, even though the step worked. */
  friction(step: string, what: string, detail: string, shot?: string) {
    const m = load()
    m.friction.push({ kind: this.kind, org: this.org, step, what, detail, shot })
    save(m)
  }

  /** Steps after this one depend on it. */
  halt() {
    this.stuck = true
  }
}

export const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
