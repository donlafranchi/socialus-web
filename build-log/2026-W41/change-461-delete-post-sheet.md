### change #461 — an owner's post delete confirms in the sheet

#318 already built the owner delete (soft delete, owner-only, off the Page and Explore at once: no cache sits between, readers filter `dissolved_at`). What differed from the ask: the confirm was an inline panel, and Delete and Edit were `text-xs` links under 44px. The confirm is now the app's one `Sheet` (Escape and the backdrop mean Keep it) and both controls are `min-h-tap`.
