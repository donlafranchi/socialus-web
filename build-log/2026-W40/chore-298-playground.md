### chore #298 — a dev-only playground for the shared components

- **`/playground`** in the `(dev)` group shows every shared component in its states: buttons (four variants, two sizes, disabled), the Follow button (follow, following, join, joined, signed out), form fields (hint, error), the sheet, the toast with Undo, and the area picker.
- **Dev only:** the `(dev)` layout's existing gate (`gate.ts`, with its test) returns not-found in production.
- **In the screenshot matrix** (`evals/screens/routes.ts`), so a component change is visible at every width in one place.
- **Kept, not folded in:** `card-gallery` stays as it is. `composer-demo` and `add-entity-demo` are create-flow demos and fall under the stop note on the create steps; they go with that redesign.

Tests: the playground's sections and its sheet and toast, seen failing first. No migration.
