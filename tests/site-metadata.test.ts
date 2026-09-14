// T148 (Issue #29) — metadata says what the app is.
//
// The site description is the first sentence most people ever read about this
// product: it is what a search result and every shared link render. The one it
// shipped with described a farmers-market marketplace and made an absolute
// claim about money. The promise sweep of 2026-09-07 read page copy and
// stopped at the component boundary, so metadata survived it.
//
// These tests hold the boundary open: the constraints below apply to whatever
// string is in the slot, not just to the one being installed today.

import { describe, it, expect, vi } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

// layout.tsx pulls a webfont through next/font/google, which needs a Next
// build to resolve. The metadata export is plain data and does not care.
vi.mock('next/font/google', () => ({
  Inter: () => ({ variable: '--font-inter' }),
}))

const { metadata } = await import('@/app/layout')

/**
 * Language that promises, absolutes, or makes a claim about money. Every one
 * of these is the shape removed from page copy on 2026-09-07 — a statement
 * nobody ratified, about fees or where dollars go, in public.
 */
const FORBIDDEN = [
  /\bevery dollar\b/i,
  /\bstays here\b/i,
  /\bno fees\b/i,
  /\bfee-free\b/i,
  /\bforever\b/i,
  /\bnever\b/i,
  /\balways\b/i,
  /\bever\b/i,
  /\bguarantee/i,
  /\bfree\b/i,
  /\b100%\b/,
]

describe('T148 — root metadata', () => {
  const description = metadata.description ?? ''

  it('is the description the PM ratified', () => {
    expect(description).toBe(
      "Find and support the people near you. Meet your neighbors, trade what you make, " +
        "volunteer where it's needed, and share an idea before you build it.",
    )
  })

  it('renders whole in a search result rather than truncating mid-clause', () => {
    expect(description.length).toBeLessThanOrEqual(155)
  })

  it('describes local discovery, not a marketplace', () => {
    // Gathering is not an afterthought clause: the positioning the launch plan
    // exists to correct is the one that led with commerce.
    expect(description).toMatch(/\bneighbors\b/i)
    expect(description).toMatch(/\btrade\b/i)
    expect(description).not.toMatch(/\bfarmers market\b/i)
    expect(description).not.toMatch(/\bmakers\b/i)
  })

  it('makes no promise, no absolute, and no claim about money', () => {
    const hits = FORBIDDEN.filter((p) => p.test(description)).map(String)
    expect(hits).toEqual([])
  })

  it('has an OpenGraph block carrying the same title and description', () => {
    // Before this ticket the root defined no openGraph at all, so a shared link
    // to the home page fell back to the bare title.
    expect(metadata.openGraph?.title).toBe(metadata.title)
    expect(metadata.openGraph?.description).toBe(description)
  })

  it('carries no OpenGraph image — that waits on the photo work', () => {
    expect(metadata.openGraph).not.toHaveProperty('images')
  })

  it('keeps the site title as the bare product name', () => {
    // Per-page titles are `{thing} — SocialUs`; the root is the suffix itself.
    expect(metadata.title).toBe('SocialUs')
  })
})

// The promise sweep's mistake was scoping to page copy. This half of the file
// scopes to the whole of src/app instead, so the next sweep cannot stop at a
// component boundary and leave metadata behind.

const APP = path.resolve(__dirname, '../src/app')

function filesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? filesUnder(path.join(dir, e.name))
      : /\.tsx?$/.test(e.name)
        ? [path.join(dir, e.name)]
        : [],
  )
}

/** Every file in src/app that exports page metadata, with its contents. */
function metadataFiles(): { file: string; source: string }[] {
  return filesUnder(APP)
    .map((file) => ({ file: path.relative(APP, file), source: readFileSync(file, 'utf8') }))
    .filter(({ source }) => /export (const metadata|(async )?function generateMetadata)/.test(source))
}

describe('T148 — every metadata export in src/app', () => {
  it('finds the metadata surfaces, so the checks below are not vacuous', () => {
    expect(metadataFiles().length).toBeGreaterThanOrEqual(9)
  })

  it('titles every page `{thing} — SocialUs`, or the bare product name', () => {
    const offenders = metadataFiles().flatMap(({ file, source }) =>
      [...source.matchAll(/title: [`'"]([^`'"]*)[`'"]/g)]
        .map((m) => m[1])
        .filter((title) => title !== 'SocialUs' && !title.endsWith(' — SocialUs'))
        .map((title) => `${file}: ${title}`),
    )
    expect(offenders).toEqual([])
  })

  it('makes no promise, absolute, or money claim in any description', () => {
    const offenders = metadataFiles().flatMap(({ file, source }) =>
      [...source.matchAll(/description:\s*\n?\s*[`'"]([^`'"]*)[`'"]/g)]
        .map((m) => m[1])
        .filter((d) => FORBIDDEN.some((p) => p.test(d)))
        .map((d) => `${file}: ${d}`),
    )
    expect(offenders).toEqual([])
  })
})
