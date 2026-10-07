// The one way a map marker is drawn (Don, 2026-10-05). Markers are DOM
// elements, so they read the colour tokens in globals.css directly: a token
// change recolours every map.

export function stylePin(el: HTMLElement, { selected = false, small = false }: { selected?: boolean; small?: boolean } = {}) {
  const base = small ? 'var(--pin-size-sm)' : 'var(--pin-size)'
  const s = selected ? `calc(${base} + var(--pin-grow))` : base
  el.dataset.selected = selected ? 'true' : 'false'
  Object.assign(el.style, {
    width: s,
    height: s,
    borderRadius: '50%',
    background: selected ? 'var(--color-pin-selected)' : 'var(--color-pin)',
    border: selected ? '3px solid var(--color-pin-selected-ring)' : '2px solid var(--color-pin-edge)',
    boxShadow: selected ? '0 0 0 2px var(--color-pin-edge), 0 1px 3px rgb(0 0 0 / 0.3)' : '0 1px 3px rgb(0 0 0 / 0.3)',
    cursor: 'pointer',
    zIndex: selected ? '1' : '',
  })
}

export function styleCluster(el: HTMLElement, count: number) {
  el.dataset.shape = 'cluster'
  el.textContent = String(count)
  Object.assign(el.style, {
    width: 'var(--cluster-size)',
    height: 'var(--cluster-size)',
    borderRadius: '50%',
    background: 'var(--color-cluster)',
    color: 'var(--color-on-cluster)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 'var(--text-caption)',
    fontWeight: '700',
    border: '2px solid var(--color-pin-edge)',
    boxShadow: '0 1px 3px rgb(0 0 0 / 0.3)',
    cursor: 'pointer',
  })
}

// #475 (PM, 2026-10-07, option A) — an exact public address is a classic
// teardrop: a round head tapering to a point. Anchor the marker at 'bottom' so
// the tip sits on the address. Drawn as SVG so the shape is the point.
const TEARDROP = 'M12 0C5.4 0 0 5.3 0 11.8 0 20.6 12 32 12 32s12-11.4 12-20.2C24 5.3 18.6 0 12 0z'

export function styleTeardrop(el: HTMLElement, { selected = false }: { selected?: boolean } = {}) {
  const w = selected ? 'calc(var(--pin-size) + var(--pin-grow))' : 'var(--pin-size)'
  el.dataset.shape = 'teardrop'
  el.dataset.selected = selected ? 'true' : 'false'
  Object.assign(el.style, {
    width: w,
    height: `calc(${w} * 4 / 3)`,
    cursor: 'pointer',
    zIndex: selected ? '1' : '',
    filter: 'drop-shadow(0 1px 2px rgb(0 0 0 / 0.35))',
  })
  const ns = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(ns, 'svg')
  svg.setAttribute('viewBox', '0 0 24 32')
  svg.setAttribute('width', '100%')
  svg.setAttribute('height', '100%')
  svg.setAttribute('fill', selected ? 'var(--color-pin-selected)' : 'var(--color-pin)')
  svg.setAttribute('aria-hidden', 'true')
  const path = document.createElementNS(ns, 'path')
  path.setAttribute('d', TEARDROP)
  path.setAttribute('stroke', selected ? 'var(--color-pin-selected-ring)' : 'var(--color-pin-edge)')
  path.setAttribute('stroke-width', selected ? '2.5' : '1.5')
  const dot = document.createElementNS(ns, 'circle')
  dot.setAttribute('cx', '12')
  dot.setAttribute('cy', '12')
  dot.setAttribute('r', '4')
  dot.setAttribute('fill', '#ffffff')
  svg.append(path, dot)
  el.replaceChildren(svg)
}

// #475 — a place known only to a metro, city or neighbourhood: a soft
// translucent disc with a count. No point, no tail, no edge, and a fill
// (translucent gold, which nothing else on the map uses) that is not the navy of
// pins and clusters. It must never read as a front door.
export function styleAreaMarker(el: HTMLElement, count: number, { selected = false }: { selected?: boolean } = {}) {
  el.dataset.shape = 'area'
  el.dataset.selected = selected ? 'true' : 'false'
  el.textContent = String(count)
  Object.assign(el.style, {
    width: 'var(--area-size)',
    height: 'var(--area-size)',
    borderRadius: '50%',
    background: 'color-mix(in srgb, var(--color-area) 32%, transparent)',
    color: 'var(--color-on-area)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 'var(--text-caption)',
    fontWeight: '700',
    boxShadow: selected ? '0 0 0 3px color-mix(in srgb, var(--color-area) 55%, transparent)' : '0 0 14px 4px color-mix(in srgb, var(--color-area) 22%, transparent)',
    cursor: 'pointer',
  })
}
