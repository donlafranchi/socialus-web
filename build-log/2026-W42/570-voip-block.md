# F081.9 · #570: phone verification refuses non-fixed VoIP numbers

`phoneIsBlocked` asks Twilio Lookup v2 (`Fields=line_type_intelligence`) and refuses `nonFixedVoip` (Google Voice and the like). The check runs in `checkPhoneAction` before `updateUser({ phone })` sends the code, so a refused number gets no text. The step says "Please use a mobile number."

Stub until the keys exist (#707): with no `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN`, or on any lookup failure, nothing is blocked. The whole step stays behind `PHONE_VERIFICATION_REQUIRED`. Cost $0.008 per lookup (the PM, 2026-10-11).

Not here: Don enabling Lookup (Line Type Intelligence) on the Twilio account.
