# Not covered yet — the waitlist, and marked example cards

*2026-09-17. The signed-out experience when someone finds their own city and SocialUs isn't there.*

## What it replaces

The scope sheet listed 295 unopened metros as dead text. Honest about scope, and
useless: someone who found their own city learned nothing — not what was
missing, not what would change it, not what the thing even looks like.

Those rows are now tappable. They still **never become the scope** — that
invariant is unchanged and tested — they open a panel instead.

## The panel, in the order the questions get asked

1. **Where this stands**, by name. No date, no queue position, no progress bar.
2. **What SocialUs looks like** — the example block, below.
3. **What they can do** — join the waitlist, which already existed end to end
   (`metro.waitlist_join`, the two counts, the standing popup). Assembly.

## Example cards — Don's ruling, 2026-09-17

Sample cards carry a mark. **The reasoning worth not relitigating is why the
mark alone is not enough: a stranger scrolling reads shapes, not badges.**
Someone skimming registers "cards of local businesses" long before reading any
label, and by then they have formed a belief about how much is here.

So the weight is carried by two things the eye cannot miss and the pointer
cannot get past, with the mark as the third line of defence:

- **Separation** — its own bounded `<section>`, own heading, own grid. Never the
  results grid, never a shared scroll region.
- **Non-interactivity** — no href, no follow or support control, no map pin, no
  lift. A card that cannot be opened cannot be mistaken for stock.
- **The mark and the tint** — persistent, on the image block where the eye lands.

**Deliberately not built on `TileCard`.** TileCard takes `href` and `action`;
reusing it would put an example card one prop away from being interactive, and
that prop would eventually get passed. Sharing the look without sharing the
affordances is the whole point.

**Never returned by search, never paginated into** — enforced by construction.
`EXAMPLES` is a module constant, not a fetch. There is no query to return it.

**The caption is load-bearing.** "These are made up, to show the kind of thing
people put on SocialUs" is a claim about the idea. "Some of what's here" would
be a claim about stock. A set of cards spanning categories reads as the second
one unless the caption says otherwise, so a test asserts it doesn't drift.

**The names.** Places are the real metro under discussion — a fake city would
make the block read as decoration from somewhere else. Businesses are obviously
illustrative ("The Example Bakery"), because a plausible name is
indistinguishable from a real listing at a glance and might collide with an
actual firm.

## Two things caught by looking, not by tests

**The tint wasn't applying.** Written as a utility class, it lost the cascade to
`.card { bg-white }`, so example cards were rendering on the same white as real
ones — the one difference a glance would not catch. Measured in the browser:
`rgb(255,255,255)` where it should have been `rgb(247,246,242)`. Now set inline,
with a test.

**Reading the session in `ExplorePage` broke 53 tests** whose Supabase mock has
no `auth` — and the mock was right. Explore has no use for the session; only the
panel does. Moved the read into the panel, where it happens once, when the panel
is actually on screen.

## For Don

**Signed out is the common case here, and the waitlist needs an account** —
`joinMetroWaitlistAction` calls `getUser()` and throws without one. The control
routes to sign-in rather than failing after the tap. **Whether an anonymous
person should be able to join the waitlist at all is a real question and it's
yours**: it needs a row not keyed to a member, which is schema, not assembly.
Built around it rather than stopping.

## Checks

`tsc` clean · build passes · 184 card + explore tests pass · 9 new ExampleBlock
tests, including that no example card is a link, has a button, or lifts.
