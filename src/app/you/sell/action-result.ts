// #107 — the shape a server action returns so its message reaches a person.
//
// Next does not serialize a custom Error across the 'use server' boundary in
// production: the client gets "An error occurred in the Server Components
// render" and a digest, and the message is gone. Throwing is therefore a way
// of deleting the thing you wrote.
//
// So failures come back as data. The client reads `.message`, which is the
// same string the action wrote.
//
// This file is deliberately not 'use server' — it exports types and plain
// helpers, and a 'use server' module may only export async functions.

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; message: string; code: string }

export function succeeded<T>(data: T): ActionResult<T> {
  return { ok: true, data }
}

export function failed<T>(message: string, code: string): ActionResult<T> {
  return { ok: false, message, code }
}
