import { describe, it, expect } from 'vitest'
import { isProductionDeployment } from './gate'

// Both directions, asserted. The point of this gate is that it is wrong in a
// way nobody notices: the old NODE_ENV version 404'd on previews and nothing
// failed, because no test and no check ever asked a deployed environment.

describe('isProductionDeployment', () => {
  it('blocks a production deployment', () => {
    expect(isProductionDeployment({ VERCEL_ENV: 'production', NODE_ENV: 'production' })).toBe(true)
  })

  it('allows a preview deployment — the whole reason this changed', () => {
    // Note NODE_ENV is 'production' here. That is not a mistake: every Vercel
    // build runs that way, which is precisely why the old gate failed.
    expect(isProductionDeployment({ VERCEL_ENV: 'preview', NODE_ENV: 'production' })).toBe(false)
  })

  it('allows a Vercel development deployment', () => {
    expect(isProductionDeployment({ VERCEL_ENV: 'development' })).toBe(false)
  })

  it('allows a laptop, where VERCEL_ENV does not exist at all', () => {
    expect(isProductionDeployment({ NODE_ENV: 'development' })).toBe(false)
    expect(isProductionDeployment({})).toBe(false)
  })

  // A build that runs `next start` locally has NODE_ENV=production and no
  // VERCEL_ENV. Under the old rule that 404'd; it must not now.
  it('allows a local production build, which is how these pages get checked', () => {
    expect(isProductionDeployment({ NODE_ENV: 'production' })).toBe(false)
  })

  it('does not treat an unrelated value as production', () => {
    expect(isProductionDeployment({ VERCEL_ENV: 'Production' })).toBe(false)
    expect(isProductionDeployment({ VERCEL_ENV: '' })).toBe(false)
  })
})

// The gate is only half the mechanism. Without force-dynamic the layout runs
// once at build time and the page is prerendered as static HTML, which is
// served to everyone regardless of runtime VERCEL_ENV. Verified: a
// production-shaped runtime served /card-gallery with HTTP 200 until
// force-dynamic was added, and 404 after.
//
// A comment cannot fail when someone deletes that export. This can.
describe('the (dev) layout forces dynamic rendering', () => {
  it('exports dynamic = force-dynamic, without which the gate never runs per request', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const src = readFileSync(join(process.cwd(), 'src/app/(dev)/layout.tsx'), 'utf8')
    expect(src).toMatch(/export const dynamic = 'force-dynamic'/)
  })
})
