# chore #207 · Ask production whether the signup hook is wired up

Issue #207. A read-only diagnostic, not a fix.

## Why

`006_auth_signup_hook.sql` `raise warning`s and returns when either Vault
secret is missing. The signup succeeds, no `members` row appears, and the
person meets "We could not finish setting up your account" in onboarding.
Nothing goes red. Production's newest `members` row is 2026-09-14, so nothing
has exercised it in over a week.

## What it checks

Trigger present and **enabled** (`tgenabled = 'D'` is a trigger that shows up
in every listing and fires never); function present; both Vault secrets
present; `net._http_response` history; and `auth.users` rows with no `members`
row — which is the symptom itself, one row per person who could not finish.

Exits non-zero when the hook cannot work, so green means something.

## It never prints a secret

Reads `vault.secrets` — the encrypted column — and selects only `name`. Never
`vault.decrypted_secrets`. Output is a name and a yes/no.

## Verified

Run against local Postgres, where the secrets are genuinely unset:

```
on_auth_user_created: enabled
handle_new_auth_user present: 1
auth_signup_hook_url: MISSING  <-- the hook returns a WARNING and creates no members row
auth_signup_hook_secret: MISSING
responses in the last 90 days: 0
auth users with NO members row: 0
RESULT: the signup hook CANNOT work as configured.  (exit 1)
```

Both the detection and the non-zero exit are exercised. It found three
orphaned `auth.users` rows on the first run — left by my own probes earlier
today — which is the check doing its job on real data; those are cleaned up and
it now reads 0.

## Why a diagnostic rather than a test signup

Creating an account is not something I do, on the user's behalf or otherwise.
It is also weaker evidence: a signup tells you it worked once, this tells you
whether it is configured, and only the second answers the question at 38 days
out.
