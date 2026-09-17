// The card system. Import from '@/components/cards'.
//
// Recovered from the pre-vendor-deletion design (ccbf54d / 4db3670) and made
// fluid: every card fills its grid cell and CardGrid decides how many cells
// there are, so the same components hold from a 27-inch monitor to an iPhone
// mini without a media query.
//
// The bottom sheet from `BusinessDetailCard` is deliberately NOT here. It is not
// a card — it is a positioned overlay that assumes a full-bleed surface behind
// it (the map), and it owns its own scroll. Generalising it would mean
// inventing an API for something with exactly one caller. It stays in
// PageDetailCard until a second surface wants one.

export { Card } from './Card'
export { CardGrid, type CardGridDensity } from './CardGrid'
export { TileCard, type TileCardProps } from './TileCard'
export { AnnouncementCard } from './AnnouncementCard'
export { StatusDot } from './StatusDot'
export { MetricTile } from './MetricTile'
