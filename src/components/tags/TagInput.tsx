'use client'

// T159 / #285 — the tag input, shared by the create flow and Page edit.
//
// A plain text input rather than a picker over a fixed list, because creators
// create their own tags — the vocabulary starts empty and fills itself.
// #316 — it behaves like a hashtag box: a typed # is ignored, and a space,
// comma or Enter commits the tag.

import { isValidTagLabel, normalizeTag, TAG_MAX_LENGTH } from '@/lib/groups/tags'
import { hashtag } from './TagChips'

/** Examples, not defaults — nothing is prefilled and nothing is submitted. */
const TAG_PLACEHOLDER = 'sourdough, honey, eggs, soap'

export interface TagInputValue {
  tags: string[]
  draft: string
}

export function TagInput({
  value,
  onChange,
  idPrefix,
  label = 'What you do',
}: {
  value: TagInputValue
  onChange: (next: TagInputValue) => void
  /** Prefix for the input id and test ids, e.g. "sell-tag". */
  idPrefix: string
  label?: string
}) {
  const add = (raw: string) => {
    const tag = raw.replace(/^#+/, '').trim()
    if (!isValidTagLabel(tag)) {
      onChange({ ...value, draft: '' })
      return
    }
    // Compare normalized so "Bread" after "bread" is not a second chip; keep
    // what was typed first, because that is what the creator already sees.
    const already = value.tags.some((t) => normalizeTag(t) === normalizeTag(tag))
    onChange({ tags: already ? value.tags : [...value.tags, tag], draft: '' })
  }

  const remove = (tag: string) => onChange({ ...value, tags: value.tags.filter((t) => t !== tag) })

  return (
    <div>
      <label htmlFor={`${idPrefix}-input`} className="text-sm font-medium text-[var(--color-fg)]">
        {label}
      </label>

      {value.tags.length > 0 && (
        <ul data-testid={`${idPrefix}-list`} className="mt-2 flex flex-wrap gap-2">
          {value.tags.map((tag) => (
            <li key={tag}>
              <span className="inline-flex items-center gap-1 rounded-full border border-neutral-300 px-3 py-1 text-sm">
                {hashtag(tag)}
                <button
                  type="button"
                  data-testid={`${idPrefix}-remove-${tag}`}
                  aria-label={`Remove ${tag}`}
                  onClick={() => remove(tag)}
                  className="ml-1 min-h-tap text-neutral-500 hover:text-neutral-900"
                >
                  ×
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      <input
        id={`${idPrefix}-input`}
        type="text"
        data-testid={`${idPrefix}-input`}
        value={value.draft}
        maxLength={TAG_MAX_LENGTH}
        placeholder={TAG_PLACEHOLDER}
        onChange={(e) => {
          const v = e.target.value
          if (/[,\s]$/.test(v)) add(v.slice(0, -1))
          else onChange({ ...value, draft: v.replace(/^#+/, '') })
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            // Commits a tag; must not submit the form it sits in.
            e.preventDefault()
            add(value.draft)
          }
        }}
        className="input mt-2 min-h-tap w-full"
      />

      <button
        type="button"
        data-testid={`${idPrefix}-add`}
        onClick={() => add(value.draft)}
        disabled={!isValidTagLabel(value.draft)}
        className="mt-2 min-h-tap text-sm font-medium text-[var(--color-accent)] disabled:opacity-40"
      >
        Add
      </button>
    </div>
  )
}
