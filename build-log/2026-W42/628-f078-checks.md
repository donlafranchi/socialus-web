# #628 — F078 criteria 3, 4, 5, 6, 7: one check each

`src/actions/report/f078-criteria.test.ts` claims criteria 3, 5, 6 and 7 whole (as ruled: courtesy notice first, email until Twilio) and 4 partly. The real operator alert runs; only the network is stubbed.

Seen failing: dropping the hide notice (3), disabling the urgent alert (5), letting every report reach the bar (6), changing the unresolved-metro fallback to 1 (7), accepting a second answer, a 30-day window, and a lapse that ignores the hide (4).

Criterion 4 is marked partial: "submitting is the only thing that creates work" no longer holds since #626, because a second report queues for staff. The scenario text needs that amendment (asked on #220).
