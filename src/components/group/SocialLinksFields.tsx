'use client'

// The composer's links-out control.
//
// Rendered only for Page kinds that carry it — Don's ruling, 2026-09-16: a
// control belongs to the Page kind. The caller passes the kind; this asks
// `kind-controls` and renders nothing when the answer is no. It does not decide
// for itself and it does not assume every Page has an Instagram.

import { SOCIAL_PLATFORMS, PLATFORM_LABELS, isSafeLinkUrl, type SocialLinks } from '@/lib/groups/social-links'
import { hasSocialLinks } from '@/lib/groups/kind-controls'

export function SocialLinksFields({
  kind,
  value,
  onChange,
}: {
  kind: string
  value: SocialLinks
  onChange: (next: SocialLinks) => void
}) {
  if (!hasSocialLinks(kind)) return null

  const set = (platform: string, raw: string) => {
    const next = { ...value }
    if (raw.trim() === '') delete next[platform as keyof SocialLinks]
    else next[platform as keyof SocialLinks] = raw
    onChange(next)
  }

  return (
    <fieldset className="mt-4" data-testid="social-links-fields">
      <legend className="text-sm font-medium text-[var(--color-fg)]">Links</legend>
      <p className="text-xs text-[var(--color-fg-muted)] mt-0.5">
        Optional. Paste the full address, starting with https://
      </p>

      <div className="mt-2 space-y-2">
        {SOCIAL_PLATFORMS.map((platform) => {
          const current = value[platform] ?? ''
          // Only complain about something they have actually typed.
          const invalid = current.trim() !== '' && !isSafeLinkUrl(current)
          return (
            <label key={platform} className="block">
              <span className="text-xs text-[var(--color-fg-muted)]">{PLATFORM_LABELS[platform]}</span>
              <input
                type="url"
                inputMode="url"
                data-testid={`social-${platform}`}
                aria-label={PLATFORM_LABELS[platform]}
                aria-invalid={invalid || undefined}
                className="input mt-0.5 w-full"
                placeholder="https://"
                value={current}
                onChange={(e) => set(platform, e.target.value)}
              />
              {invalid ? (
                <span role="alert" className="text-xs text-[var(--color-danger,#b00)]">
                  Needs to start with https://
                </span>
              ) : null}
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}
