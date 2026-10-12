# change: urgent-report alerts go by email until a Twilio number exists

Dispatch call (2026-10-12, #707): there is no Twilio number for now. `alertOperator` (`src/lib/notify/operator-alert.ts`) texts through `textOperator` when all four Twilio values are set (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`, `OPERATOR_PHONE`), automatically; otherwise, or if the text is refused, it emails every address in `ADMIN_EMAILS` through Resend (`RESEND_API_KEY`, sender `FOLLOW_EMAIL_FROM`, default `onboarding@resend.dev`). Same message as the text: the reason and where to look, never the reporter or what they wrote. `report.create` calls it for Threat of harm and Sensitive content as before.

`ADMIN_EMAILS` is read for this alert only and grants no authority. #570's VoIP block stays stubbed and `PHONE_VERIFICATION_REQUIRED` stays unset.

Needs from Don: nothing, if `RESEND_API_KEY` and `ADMIN_EMAILS` are set in Vercel production. Until he verifies a sender domain in Resend, mail goes from `onboarding@resend.dev`, which Resend only delivers to the account owner's own address.
