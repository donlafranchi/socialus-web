// #978 — fetch and run a lazy chunk while the phone is idle, so the tap that needs it waits only on drawing.
// Skipped on Data Saver. Safari has no requestIdleCallback, so a timer stands in.
type Conn = { saveData?: boolean }

export function preloadWhenIdle(load: () => Promise<unknown>, w: Window = window): () => void {
  if ((w.navigator as Navigator & { connection?: Conn }).connection?.saveData) return () => {}
  const run = () => void load().catch(() => {})
  if (typeof w.requestIdleCallback === 'function') {
    const id = w.requestIdleCallback(run, { timeout: 4000 })
    return () => w.cancelIdleCallback(id)
  }
  const id = w.setTimeout(run, 2000)
  return () => w.clearTimeout(id)
}
