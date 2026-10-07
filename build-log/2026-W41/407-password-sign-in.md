# change #407 — sign in with email and password, alongside the link

- Sign-in keeps the emailed link first; "Use a password instead" adds a password field, with "Forgot password?" emailing a reset link that lands on You → Password, signed in.
- You → Settings has a Password row leading to /you/password: set or change it (at least 8 characters).
- Tests: `src/components/auth/password-sign-in.test.tsx`.
