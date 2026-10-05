# bug #332 — sign-in remembers the email and offers autofill

- The email field on both sign-in forms is a real email field in a form: name, inputmode, no autocapitalise or autocorrect. Its autocomplete is "email" on the email-link form and "username" on the password form.
- The password form carries the email as a username field and names its password field, so Keychain, Chrome and 1Password can pair the two.
- After a password sign-in or sign-up, the browser is asked to offer saving the login (Credential Management API, where it exists).
- The last email used is remembered on the device, pre-filled and editable. Blocked storage is harmless.
- Members only sign in with an emailed link. The password form is the unlinked page the evals use, so saving a login has nowhere public to apply yet.
- Tests: src/components/auth/autofill.test.tsx, 11 tests. 9 were seen failing before the change.
