// #500 — how the live smoke opens a screen. See navigate.test.ts for why.

export interface Navigable {
  goto(url: string, opts: { waitUntil: 'domcontentloaded' | 'load'; timeout?: number }): Promise<{ status(): number } | null>
}

export interface Navigation {
  status: number
  timedOut: boolean
  retried: boolean
}

const isTimeout = (e: unknown) => e instanceof Error && (e.name === 'TimeoutError' || /Timeout \d+ms exceeded/.test(e.message))

export async function navigate(page: Navigable, url: string): Promise<Navigation> {
  let retried = false
  for (;;) {
    try {
      const res = await page.goto(url, { waitUntil: 'domcontentloaded' })
      return { status: res?.status() ?? 0, timedOut: false, retried }
    } catch (e) {
      if (!isTimeout(e)) throw e
      if (retried) return { status: 0, timedOut: true, retried }
      retried = true
    }
  }
}
