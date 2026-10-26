# #648 part 2 — record NCMEC's report number on the row

A held (child-safety) row's detail now shows how long the item is kept and, until the operator has filed the manual CyberTipline form (beta), a field for the number NCMEC gives back. Saving it (`report.ncmec_record`, operator only) writes the number, who and when on the legal hold and restarts the one-year keep from that day. The queue reads the hold; `NcmecRecord` shows it. A marker in `NcmecRecord.tsx` is the entity-setup reminder: register with the CyberTipline and switch from the manual form (PM, 2026-10-11).

Seen failing (mutants): the year not restarting, the form showing after a number is recorded, the section not wired into the row. The database test covers the handler as the operator and as a stranger, and the queue read.

Not built, and why: the verified-phone and legal-name collection and the plain "we do not tolerate it" statement (F077/F081). Phone verification is parked by the PM (no Twilio number yet) and the statement is new member-facing copy, which is the PM's to word.
