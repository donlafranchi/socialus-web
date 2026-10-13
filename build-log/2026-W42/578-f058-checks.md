# #578 — F058 criteria 1, 3, 5, 6: one check each

`src/actions/report/f058-criteria.test.tsx` claims each whole. Seen failing against: a report that drops the member's words, a send that skips the sign-in check (1); the operator permission removed (3); the urgent alert removed, the queue reading decided reports instead of open ones (5); a second reversal allowed, the decider's name dropped from the card (6).
