### change #297 (part 1) — one sheet, one toast, the area picker

- **`Sheet`** (`src/components/ui/Sheet.tsx`): a bottom sheet on phone, a centred dialog from 744, on the sheet layer. Modal, with a labelled title. Focus moves in and back to the opener; Tab stays in; Escape and the backdrop close it; the page behind can't scroll. Slots for one header action and one footer action.
- **On it now:** the Explore filter sheet (L02), the area picker (L03, was ScopeSheet, now `AreaPicker`) and the sign-in sheet (L19). Each keeps its test ids.
- **`Toast`** (L25): one, bottom-centre, above the bottom nav and the safe area, on the toast layer, announced politely, with an optional single action such as Undo. Same API, so its callers are untouched, including the create-flow files under the stop note.
- **Not here:** the report sheet, which waits for #284 (report reasons) to merge because that PR rewrites it; then it moves in the Page template (#300). The Follow button, buttons and form fields are part 2.

Tests: Sheet and Toast seen failing first. The filter sheet's tests now assert the shared values (capped height in vh, `min-h-tap`). No migration.
