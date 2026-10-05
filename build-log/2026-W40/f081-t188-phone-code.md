### F081 · T188 (#222) — a text-message code at signup

Don, 2026-10-01: a member is verified as a person by a text-message code to their phone, at signup. Builders are the named exception (#280).

- **Onboarding** opens with "Verify your phone": a US number, "Text me a code", then a 6-digit code. Supabase's change-phone flow sends and checks the code. The number lives on the login only (`auth.users`), which no member or visitor can read.
- **The gate:** a signed-in member with no verified phone is sent to onboarding on any page load. Sign-in, onboarding and the API stay open, form posts are never redirected, and builders are never asked.
- **Off until switched on:** `PHONE_VERIFICATION_REQUIRED=1`. Until Don connects an SMS provider, turning it on would trap every member on a code that can't be sent.
- **Signup line** (F081 criterion 5, Don's words) shows on the create-account screen.
- **Local and CI:** `config.toml` turns phone confirmations on, with four fixed test numbers (916-555-0100 to 0103, code 123456) and a placeholder provider that never sends.

Tests:
- The gate's and normalisation's checks were seen failing against stubs both ways.
- The phone step, onboarding and signup line tests were seen failing first.
- Against a local Supabase: a wrong code is refused, the right code confirms the phone, and phone-only signup stays off.

**No migration.**
