// #332 — after a password sign-in, ask the browser to offer saving the login.
// Chrome and Edge do it through the Credential Management API. Safari and
// password managers notice the form itself (username plus password fields).

type PasswordCredentialCtor = new (init: { id: string; password: string; name?: string }) => Credential

export async function offerToSaveLogin(email: string, password: string): Promise<void> {
  const Ctor = (globalThis as { PasswordCredential?: PasswordCredentialCtor }).PasswordCredential
  if (!Ctor || !navigator.credentials?.store) return
  try {
    await navigator.credentials.store(new Ctor({ id: email, password, name: email }))
  } catch {}
}
