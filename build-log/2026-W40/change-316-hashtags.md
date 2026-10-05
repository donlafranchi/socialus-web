### change #316 — tags look and behave like hashtags

Don, 2026-10-02.
- **#tag chips** (`TagChips`): "Local food" shows as #Localfood. Each chip opens Explore filtered by that tag (`/explore?category=<normalized>`).
  - **On Explore cards:** in the card's action row, outside the card's own link.
  - **On a Page:** under the description, signed in only.
  - Signed out, tags are never sent (F093), so none show.
- **The tag box:** a typed # is ignored, so #bread is the tag bread. A space, a comma or Enter commits a tag. Tags in the box show as #tags.
- **The Page loader** reads a Page's visible tags for signed-in visitors only.
- No migration. The create walkthrough's own tag step is untouched (stop note).

Tests: chips, the box, cards, the Page and the loader, seen failing first.
