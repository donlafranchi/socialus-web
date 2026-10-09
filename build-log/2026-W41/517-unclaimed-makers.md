### change #517 — the researched Sacramento makers become unclaimed Pages

Why Explore had no real local businesses: #353 built the mechanics (label, Claim, Remove, source log) and said "not here: loading the listings." Nobody ever wrote the loader, so production held zero unclaimed Pages.

`src/lib/unclaimed/plan.ts` picks and words the Pages from `scripts/unclaimed/makers.json` (the 52 researched rows): holds out the ten Don is visiting in person, the rows the research marked HOLD or Low-medium, and one with no own site of its own; orders High, Medium-high, Medium, for-profit before nonprofits and galleries; description in our own words, ending "Claim this Page to tell your own story." `load.ts` writes them idempotently (keyed on the business's own site, so a removed Page is never brought back). Run it from Actions → "Unclaimed Pages load" (dry run unless "write" is ticked).

Found on the way: `browse_feed` (Explore) runs as its owner and ignored `unclaimed_hidden_at`, so a Page someone asked us to remove would have kept appearing in Explore. Migration `20261009010000` closes it; the loader test failed on it first.

Not here: photos and phone numbers (they need fetching from each site; the Pages show the default picture until then), the first 26 listings in `listings.json` (also never loaded), the 15%-per-category cap (four categories cannot each be 15%).

**2026-10-09, Don: "Every shop goes in."** The hold-out list, the HOLD rows and the no-own-site skip are gone: all 52 load. The nine HOLD rows were re-checked against their own sites that day; none is shown closed (Smith Gallery's site did not answer; JAYJAY's last exhibitions are 2020). Sacramento Bicycle Kitchen's own site was found in the first 26 listings. The loader now reads every `scripts/unclaimed/makers*.json`, so the next list drops in as a new file.
