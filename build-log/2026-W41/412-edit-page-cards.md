### change #412 — the Edit Page as section cards

The owner's Edit Page (`/g/<handle>/edit`, address unchanged) is now cards in four collapsible groups (About your Page, Location, Contact where the phone is on, Tags and links), each card showing what's set now with one Edit that opens that section's existing sheet; one Save saves and closes. The one long `EditPageForm` is gone, its section coverage ported to the sheet tests.
- The Page's in-place edit mode (#302's Edit/Done toggle and the pencils through `ShopPublicPage`) is removed; the owner bar and panel's Edit link to the card editor. A draft's "Before you publish" still opens each section's sheet in place.
- The words and photo sheets now carry the posting-safety line (F080.5), which the in-place sheets had lost.
