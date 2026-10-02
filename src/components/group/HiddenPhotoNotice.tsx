// T160 (Issue #62) — what the owner sees when their photo is hidden.
//
// It tells them **that** and **why** — never **who**. The component takes no
// props at all, deliberately: there is no parameter through which a reporter's
// identity or a report's text could reach this surface, now or in a later
// refactor. A reporter whose identity leaks to the reported party is a
// member-harm failure, not a polish bug.
//
// Rendered only on the owner's own Page. Everyone else sees exactly what a
// Page with no photo sees — today that is nothing, and once T146 lands it is
// the default art. Neither reveals that a photo exists or that it was reported.
//
// v1 limit, recorded on #62: "told immediately" means "unmissable the moment
// they next open their Page," not a push. There is no email substrate in this
// codebase — RESEND_API_KEY sits in .env.local.example and nothing in src/
// reads it — so a real notification is its own ticket.

export function HiddenPhotoNotice() {
  return (
    <div
      data-testid="hidden-photo-notice"
      role="status"
      className="rounded-md border border-dashed border-[var(--color-charcoal-100)] bg-neutral-50 p-6 text-sm text-[var(--color-charcoal-900)]"
    >
      <p className="font-medium">Your photo is hidden for now.</p>
      <p className="mt-1 text-neutral-600">
        Someone let us know about it, and a person is taking a look. If it&rsquo;s
        fine, it comes back. Only you can see this message.
      </p>
    </div>
  )
}
