# change #363 — Page types: business and group, use cases as presets

- Ruled 2026-10-05: every Page is an organization; two types, business and group. The use cases from socialus-plan planning/PAGE-KINDS.md are presets: selling and service under business, gathering and testing interest under group.
- Migration 20261004130000_page_types: groups.kind becomes business | group, and a new groups.use_case (not null, checked against the type) is added. The six stored kinds map per PAGE-KINDS.md § The six existing values: business → business/selling; place, interest, practice, event_anchored, family → group/gathering, with family's privacy kept in discoverability. The three social groups stored as businesses become groups (as #362; either order applies). The discoverability trigger fills use_case and no longer infers private from a kind.
- The type sets the defaults: a business leads with contact and lists Products & services; a group leads with Join and its next event. Products & services is now a component any Page can turn on.
- Create's three questions are presets (selling, gathering, testing interest). Settings: "Type of Page" picks one of the four use cases under the two types; the managing role swaps with the type.
- Kind line: type · collection, else type · use case ("Group · Events"). Cards show the type alone until Explore's feed carries the use case.
- Fixtures, seeds and evals move to the two types.
