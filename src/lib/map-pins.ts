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
