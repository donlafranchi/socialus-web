# Saving a social link no longer throws

*2026-09-28. bug · #231.*

## What was wrong

Two things, stacked. `social_links_values_https` (20260917001314) matched
`[^[:space:]]{1,500}`; Postgres caps a repetition bound at 255, so the regex
raised `2201B` on every non-empty map. The `{}` default never reaches it, so
the migration applied and nothing failed until Don saved his Instagram
(Vercel digest `2399908884`). And `editPageAction` threw, which Next redacts in
production to a generic render error — so even the handler's own sentences
("these links could not be read: instagram") never reached an owner.

Not related to the photo.

## The fix

A migration replaces the function: shape by regex (`+`), length by
`char_length <= 508` — the same 1..500 after `https://`. The CHECKs call the
function by name, so nothing else moves. The action returns
`{ ok: false, message }` instead of throwing; an `ActionError` passes its
message through, anything else is logged and the owner gets a plain sentence.

## How it was checked

`tests/social-links-db.test.ts` executes the function. Against the old one on
Postgres 17.6.1.166 (production's build): 5 red with production's exact error.
Against the new one: 6 green. `edit/actions.test.ts`: 2 red before, green
after. The form's handler-message test, rewritten to a returned failure, is red
against the old form.
