### bug #334 — signed-out Explore is list only

Ruling 2026-10-01: signed out, Explore shows the list at every width and the Map control opens sign-up. `BrowseSurface` forces the single layout when signed out (no map pane, no divider handle); the bottom dock stays and its list/map switch opens the existing `SignInPrompt` with a new gated action `map` (sign-up). A member's layout is unchanged. F059 layout tests and the F059 eval now state both halves. New copy ("Sign up to see the map" and its reason) is a placeholder for the PM.
