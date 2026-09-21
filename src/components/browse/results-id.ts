// The id of Browse's results container.
//
// It lived on `KindFilterPills` because the pill row was the tablist that
// owned the panel. The pill row is gone (ruled 2026-09-12: zero filter pills
// outside the filter view), so the id needed a home that is not a control —
// the region exists whether or not anything points at it.
//
// Renamed from `EXPLORE_RESULTS_ID` / `explore-results` with the surface.
export const BROWSE_RESULTS_ID = 'browse-results'
