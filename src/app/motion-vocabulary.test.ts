// The motion vocabulary is four DIFFERENT gestures sharing one set of tokens.
// That distinction is the whole change — Don asked for "more of that kind of
// feedback", and the failure mode is one effect copy-pasted onto everything.
// A regression here looks like a button quietly acquiring `lift` again, which
// reads as a card. These assertions are what notice.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const css = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8')

/** The body of one `@utility name { ... }` block, brace-matched. */
function utility(name: string): string {
  const start = css.indexOf(`@utility ${name} {`)
  expect(start, `@utility ${name} is missing`).toBeGreaterThan(-1)
  let depth = 0
  for (let i = start; i < css.length; i++) {
    if (css[i] === '{') depth++
    else if (css[i] === '}' && --depth === 0) return css.slice(start, i + 1)
  }
  throw new Error(`@utility ${name} is unbalanced`)
}

describe('the four gestures are actually different', () => {
  it('a card rises and casts a shadow', () => {
    const lift = utility('lift')
    expect(lift).toContain('--lift-distance')
    expect(lift).toContain('var(--lift-shadow)')
  })

  it('a button goes down and never rises — a button that lifts reads as a card', () => {
    const press = utility('press')
    expect(press).toContain('var(--press-scale)')
    expect(press).not.toContain('--lift-distance')
    expect(press).not.toContain('--lift-shadow')
  })

  it('a row moves sideways, not up into the row above it', () => {
    const nudge = utility('nudge')
    expect(nudge).toContain('translate: var(--nudge-distance) 0')
    expect(nudge).not.toContain('--lift-shadow')
  })

  it('the buttons use press, not lift', () => {
    for (const cls of ['.btn-primary', '.btn-secondary', '.chip']) {
      const block = css.slice(css.indexOf(`${cls} {`), css.indexOf('}', css.indexOf(`${cls} {`)))
      expect(block, `${cls} should press`).toContain('@apply press')
    }
  })
})

describe('composability with a future scroll-shrink', () => {
  // A scroll-responsive header wants to drive `scale` while hover drives
  // `translate`. With the `transform` shorthand those fight and the last
  // writer wins. The individual properties compose.
  it('no gesture uses the transform shorthand', () => {
    for (const name of ['lift', 'press', 'nudge', 'reacts']) {
      expect(utility(name), `@utility ${name} must not use transform:`).not.toMatch(
        /(^|[^-])transform:/m,
      )
    }
  })

  it('an icon reacts to its ancestor through an inherited property, not its own hover', () => {
    const reacts = utility('reacts')
    expect(reacts).toContain('var(--icon-scale, 1)')
    expect(reacts).not.toContain(':hover')
    // The gestures are what publish it.
    for (const name of ['lift', 'press', 'nudge']) {
      expect(utility(name), `@utility ${name} should drive --icon-scale`).toContain('--icon-scale:')
    }
  })
})

describe('reduced motion removes movement and keeps colour', () => {
  for (const name of ['lift', 'press', 'nudge', 'reacts']) {
    it(`${name} honours prefers-reduced-motion`, () => {
      const body = utility(name)
      expect(body).toContain('prefers-reduced-motion: reduce')
      const reduced = body.slice(body.indexOf('prefers-reduced-motion: reduce'))
      // Movement is removed outright rather than shortened.
      expect(reduced).toMatch(/(translate|scale|transition):\s*(none|;)|box-shadow:\s*none/)
    })
  }

  it('lift and press keep their colour transitions under reduced motion', () => {
    for (const name of ['lift', 'press']) {
      const body = utility(name)
      const reduced = body.slice(body.indexOf('prefers-reduced-motion: reduce'))
      expect(reduced, `${name} should keep colour`).toContain('background-color')
    }
  })
})

describe('the tokens are shared, which is what makes four gestures one product', () => {
  it('every gesture times off the shared pair', () => {
    for (const name of ['lift', 'press', 'nudge', 'reacts']) {
      expect(utility(name)).toContain('var(--motion-duration)')
      expect(utility(name)).toContain('var(--motion-ease)')
    }
  })
})
