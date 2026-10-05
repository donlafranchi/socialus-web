'use client'

// The prefix is shown; the member types only their handle.
//
// Replaces the URL field that rejected Don's Instagram account. That field
// asked for `https://instagram.com/donlafranchi` and refused `donlafranchi` —
// which is the part a person actually knows about themselves. Nobody thinks of
// their handle as a URL.
//
// The prefix sits INSIDE the input's box, before the caret, rather than as a
// label above it. A label saying "instagram.com/" above an empty box still
// leaves the member guessing whether to type it again.
//
// Validation runs as they type but only complains about something they have
// actually finished typing a character of, and says what IS allowed.

//
// #302 — `compact` (the Links sheet) shows only the links the Page has, and an
// "Add a link" picker for the rest, instead of every platform at once (Google
// Business Profile's "Add social profile").

import { useState } from 'react'
import { PLATFORM_LABELS, SOCIAL_PLATFORMS, type SocialPlatform } from '@/lib/groups/social-links'
import { PLATFORM_FIELDS, checkHandle } from '@/lib/groups/social-handles'

export function SocialHandleFields({
  value,
  onChange,
  compact = false,
}: {
  /** Handles, not URLs. */
  value: Partial<Record<SocialPlatform, string>>
  onChange: (next: Partial<Record<SocialPlatform, string>>) => void
  compact?: boolean
}) {
  const set = (platform: SocialPlatform, raw: string) => {
    onChange({ ...value, [platform]: raw })
  }
  const [added, setAdded] = useState<SocialPlatform[]>(() => SOCIAL_PLATFORMS.filter((p) => (value[p] ?? '').trim() !== ''))
  const shown = compact ? added : SOCIAL_PLATFORMS
  const rest = SOCIAL_PLATFORMS.filter((p) => !added.includes(p))

  return (
    <fieldset data-testid="social-handle-fields">
      <legend className="text-sm font-medium text-[var(--color-fg)]">Where else to find you</legend>
      <p className="mt-1 text-xs text-[var(--color-fg-muted)]">
        Just your username — we&rsquo;ll build the link.
      </p>

      <div className="mt-2 space-y-2">
        {shown.map((platform) => {
          const raw = value[platform] ?? ''
          const field = PLATFORM_FIELDS[platform]
          const result = checkHandle(platform, raw)
          const problem = raw.trim() !== '' && !result.ok ? result.problem : null

          return (
            <label key={platform} className="block">
              <span className="text-xs text-[var(--color-fg-muted)]">
                {PLATFORM_LABELS[platform]}
              </span>
              <span
                className={`mt-0.5 flex items-stretch overflow-hidden rounded-md border ${
                  problem ? 'border-[var(--color-danger,#b00)]' : 'border-[var(--color-border)]'
                }`}
              >
                <span
                  data-testid={`social-prefix-${platform}`}
                  aria-hidden="true"
                  className="flex items-center bg-[var(--color-surface)] px-2 text-xs text-[var(--color-fg-muted)] whitespace-nowrap"
                >
                  {field.prefix}
                </span>
                <input
                  type="text"
                  inputMode="text"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  data-testid={`social-${platform}`}
                  aria-label={`${PLATFORM_LABELS[platform]} — ${field.prefix}`}
                  aria-invalid={problem ? true : undefined}
                  className="min-w-0 flex-1 bg-white px-2 py-2 text-sm outline-none"
                  placeholder={platform === 'website' ? 'oakparkbakery.com' : 'yourname'}
                  value={raw}
                  onChange={(e) => set(platform, e.target.value)}
                  autoFocus={compact && raw === '' && added.at(-1) === platform}
                />
              </span>
              {problem ? (
                <span role="alert" className="text-xs text-[var(--color-danger,#b00)]">
                  {problem}
                </span>
              ) : null}
            </label>
          )
        })}
      </div>
      {compact && rest.length > 0 && (
        <label className="mt-3 block">
          <span className="sr-only">Add a link</span>
          <select
            data-testid="social-add"
            className="input"
            value=""
            onChange={(e) => setAdded([...added, e.target.value as SocialPlatform])}
          >
            <option value="" disabled>
              {added.length === 0 ? 'Add a link…' : 'Add another link…'}
            </option>
            {rest.map((p) => (
              <option key={p} value={p}>
                {PLATFORM_LABELS[p]}
              </option>
            ))}
          </select>
        </label>
      )}
    </fieldset>
  )
}
