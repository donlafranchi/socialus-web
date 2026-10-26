// #790 — Mapbox prints any error event to the console when nothing listens. A tile or style
// request lost on the network (a blip, or cancelled by a resize) is not the page failing:
// warn about it, and keep every other map error a console error.
const NETWORK = /failed to fetch|networkerror|load failed|network request failed/i

export const isNetworkError = (e: { error?: { message?: string } }) => NETWORK.test(e.error?.message ?? '')

type ErrorEvent = { error?: Error }
type Log = Pick<Console, 'warn' | 'error'>

export function handleMapErrors(map: { on(type: 'error', h: (e: ErrorEvent) => void): unknown }, log: Log = console) {
  map.on('error', (e) => {
    if (isNetworkError(e)) log.warn('[map] a map tile did not load:', e.error?.message)
    else log.error('[map]', e.error)
  })
}
