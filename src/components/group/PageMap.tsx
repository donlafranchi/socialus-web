// #458 — a small map in the Location section: a static image at the pin, so
// the Page loads no map library. Signed-in visitors only; the caller decides.

const STYLE = 'mapbox/light-v11'

export function PageMap({ lng, lat, label, area }: { lng: number; lat: number; label: string; area: boolean }) {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
  if (!token) return null
  const at = `${lng},${lat}`
  const src = `https://api.mapbox.com/styles/v1/${STYLE}/static/pin-s+1a1a1a(${at})/${at},${area ? 13 : 15},0/640x240@2x?access_token=${token}`
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={`Map of ${label}`}
      loading="lazy"
      width={640}
      height={240}
      className="aspect-[8/3] w-full rounded-md border border-[var(--color-border)] object-cover"
    />
  )
}
