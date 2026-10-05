### change #297 (part 2) — the Follow button, Button and form fields

- **`Button`** (`src/components/ui/Button.tsx`): primary, secondary, quiet and danger; md 44 and sm 36; weight 600; a link when given an `href`. `.btn-primary` and `.btn-secondary` move to weight 600 and a 44px floor, so every existing button matches.
- **Follow button:** Follow / Following ✓ and Join / Joined ✓, where the check is an icon kept out of the accessible name. Signed out, the same Follow opens the sign-in sheet and keeps the tap: sign-in returns to the Page. The owner never sees it (#267, unchanged).
- **`Field`** (`src/components/ui/Field.tsx`): a label, an optional hint and an inline error, tied to the control with `aria-describedby` and `aria-invalid`. Screens move onto it with their templates.
- **Not here:** "Ask to join / Asked". Join approval isn't built (joining is immediate today), so offering it would promise something that doesn't happen.

Tests: Button, Field and the Follow button's signed-out and check states seen failing first. No migration.

**2026-10-04, Don's fix:** signed out, nobody can follow. Every signed-out Follow now says "Sign up to follow" (or "Sign up to join"): on Pages, members and venues. The Page sheet is titled "Sign up to follow" and leads to sign-up, which is the same email flow as sign-in.
