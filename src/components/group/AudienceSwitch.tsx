'use client'

// Who an announcement reaches.
//
// COPY IS RATIFIED — F072 criterion 4 and Issue #179 both give it verbatim, so
// none of these strings is a choice being made here. "Who sees this"; on and
// default "Anyone"; off "Only people who get updates from you".
//
// THE WORDS NAME THE PEOPLE, NEVER A KIND OF POST. Criterion 4 is explicit
// that neither "announcement" nor "bulletin" appears in any label here — which
// reads as a contradiction of "announcement is the word everywhere" and is
// not: the word is the primary control's, and this switch is about reach.
//
// AT ZERO THE COUNT IS WORDS. "Nobody yet", never "0" — design-language
// principle 11. A creator with nobody following them is at the start of
// something, and a zero says they failed at it.
//
// THE RESTRICTED SETTING IS VISIBLE AND NOT SELECTABLE-AND-POSTABLE
// (criterion 4, and #179 § 5). Follower delivery does not exist — it is in
// ROADMAP.md § Cut. Telling a creator they reached forty-two people, none of
// whom receive anything, is a lie; hiding the setting is a different lie, that
// reaching your own followers was never the idea. So it is shown, it can be
// chosen, and choosing it says plainly why nothing can be sent yet.

export type Audience = 'anyone' | 'followers'

/** The reason, in one sentence, shown when the restricted setting is chosen.
 *  Exported because the composer disables Announce on the same fact and the
 *  two must not drift. */
export const FOLLOWERS_NOT_YET =
  'Sending only to the people who get updates from you isn’t working yet, so this would reach nobody. Choose Anyone to post it.'

export function AudienceSwitch({
  value,
  onChange,
  followerCount,
  idPrefix,
}: {
  value: Audience
  onChange: (next: Audience) => void
  /** How many people get updates from this Page right now. */
  followerCount: number
  idPrefix: string
}) {
  const on = value === 'anyone'
  return (
    <div data-testid={`${idPrefix}-audience`}>
      <span id={`${idPrefix}-audience-title`} className="text-sm font-medium text-[var(--color-fg)]">Who sees this</span>
      <div className="mt-1 flex items-center gap-3">
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-labelledby={`${idPrefix}-audience-title`}
          data-testid={`${idPrefix}-audience-switch`}
          onClick={() => onChange(on ? 'followers' : 'anyone')}
          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors before:absolute before:-inset-2.5 before:content-[''] ${
            on ? 'bg-[var(--color-accent)]' : 'bg-[var(--color-control-border)]'
          }`}
        >
          <span
            className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
              on ? 'translate-x-5' : 'translate-x-0.5'
            }`}
          />
        </button>
        <span className="text-sm text-[var(--color-fg)]" data-testid={`${idPrefix}-audience-label`}>
          {on ? 'Anyone' : 'Only people who get updates from you'}
        </span>
      </div>
      {!on && (
        <>
          <p className="mt-1 text-sm text-[var(--color-fg-muted)]" data-testid={`${idPrefix}-audience-count`}>
            {followerCount > 0 ? `${followerCount} right now` : 'Nobody yet'}
          </p>
          <p role="alert" className="mt-1 text-sm text-[var(--color-fg)]" data-testid={`${idPrefix}-audience-blocked`}>
            {FOLLOWERS_NOT_YET}
          </p>
        </>
      )}
    </div>
  )
}
