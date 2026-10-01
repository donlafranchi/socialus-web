### bug #205 — onboarding no longer gives every new member a made-up home place

F081 criterion 7: onboarding assigns no place the person did not give.

- `completeOnboardingAction` saves the name and marks the login onboarded (`user_metadata.onboarded`). It no longer writes the fictional "Good Place" as anyone's `primary_home`. `setHomeLocalityAction`, now unused, is gone.
- `/onboarding` sends a member on when they are marked onboarded, or still hold the place written before this change.
- **Not here:** the zip step that sets the home metro. Every US zip has to resolve through the national HUD-USPS crosswalk (criterion 8), and production holds Sacramento's 90 zips only.
- **Data left as is:** members who already hold the Good Place, and the fictional places in production.

Tests: `src/app/onboarding/actions.test.ts`, seen failing first (`[guards F081.7]`). **No migration.**
