# bug #205 · The default home place comes from a migration, not a seed

The half of #205 that is a plain defect. The product half — whether a member
picks their own home place, and the legal-name column — is untouched and stays
Don's.

## The defect, reproduced before it was fixed

`src/app/onboarding/actions.ts` names `DEFAULT_HOME_PLACE_ID`. That row existed
only in `supabase/seeds/the-good-place.sql`, and
`member_place_interests.place_id` is a foreign key. Against this machine's
local database — migrations applied, that seed not run — the test wrote the
exact FK the onboarding path writes and got:

```
insert or update on table "member_place_interests" violates foreign key
constraint "member_place_interests_place_id_fkey"
Key (place_id)=(10000000-0000-4000-8000-000000000003) is not present in
table "places".
```

**Code may depend on a migration. Code may not depend on a seed.** That is the
whole of it. Production had been seeded, so nothing was visibly wrong there —
which is exactly the shape `CLAUDE.md` § The seeds are privileged warns about,
and this time it bit in the other direction: the seeded database was the one
that worked.

## Fixed

A migration creating the three-tier chain the code needs — state, county, city
— one INSERT per tier, because `places_set_ancestor_state_id` is a BEFORE
trigger that SELECTs the parent and a row inserted earlier in the same
multi-row INSERT is not reliably visible to it.

`on conflict (id) do nothing`, not `do update`. The seed keeps `do update` and
stays the owner of this content; the migration only asserts the row exists. So
re-running the seed still reconciles, and applying this to production — which
already has all six rows, verified against its own REST endpoint — writes
nothing.

The centroid is derived the same way migration 026 and the seed derive it, and
only `where centroid is null`, so production's existing rows are untouched.
`resolve_home_metro` reads the centroid; without it the row would exist, the FK
would pass, and the home metro would silently resolve to nothing — the loud
failure replaced by a quiet wrong answer.

Only the chain the code needs. The three neighbourhoods are demo content, not a
code dependency, and they stay in the seed.

## Verified against the real database

Before: the FK violation above. After `supabase migration up --local`, the same
onboarding call — `memberPlaceInterestAdd(ctx, { placeId, scopeKind:
'primary_home' })`, exactly what `setHomeLocalityAction` invokes — on a real
`auth.users` row and a real member:

```
PASS  onboarding completes against a migrations-only database
PASS  home metro derived: Sacramento-Roseville, CA
PASS  primary_home points at the place the code names
```

Ten tests: the static half pins the migration and the constant to the same
uuid, because two hand-maintained copies of one id is how they stop agreeing.

## One thing worth keeping

The static test initially failed on its own explanation — the header comment
says "ON CONFLICT DO NOTHING, NOT DO UPDATE", and the assertion scanning for
`do update` matched that sentence. The tests now strip `--` comments first. A
test that fails on the prose explaining it is a test that gets deleted rather
than understood.

## The flake nearly hid a check that mattered

`manifest.test.ts` timed out again (5577ms against 5000ms) — fifth today. This
branch **does** touch migrations, so unlike the previous four this was a check
whose answer I actually needed. Ran it directly:
`generate-migration-manifest --check` exits 0, 55 migrations, and the test
passes alone. That is the cost of a flaky guard, arriving on schedule.

## Not done here

Whether the default should be a fictional place at all, and whether a member
picks their own — #205's remaining half, item 7 on Don's list. The row this
migration creates still says `fictional: true`, because it still is.
