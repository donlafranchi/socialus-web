'use client'

// TEMPORARY (#1335): Sentry setup check. Delete this page and /api/sentry-example-api before merging.
export default function SentryExamplePage() {
  return (
    <main style={{ padding: '2rem' }}>
      <button
        type="button"
        onClick={async () => {
          await fetch('/api/sentry-example-api')
          throw new Error('Sentry example frontend error')
        }}
      >
        Throw test error
      </button>
    </main>
  )
}
