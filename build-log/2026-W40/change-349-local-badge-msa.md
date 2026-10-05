# change #349 — the local-owner badge counts anywhere in the metro

- Migration `20261004110000_local_badge_msa`: `zip_is_proximal_to_location` is true when the owner's ZIP is in an MSA whose county outline (#347) covers the Page's pin. It no longer goes through the place chain, which gave no badge to pins outside the hand-drawn shapes, or in Davis, Folsom and Roseville, which had no MSA code.
- The boundary loader fills `zip_metro_crosswalk` from the Census ZCTA-county file: every ZIP whose land is mostly in the metro's counties. Sacramento goes from 90 to 126 ZIPs. It adds and refreshes, and never removes.
- tests/local-badge-msa-db.test.ts brings its own county outline and ZIPs. Folsom and a rural pin count; a pin or ZIP outside the metro doesn't. Seen failing against the old function.
