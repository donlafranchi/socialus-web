import { scrubEvent, scrubTransaction } from './scrub'

// Sentry's own production advice (docs.sentry.io/platforms/javascript/guides/nextjs/configuration/sampling/):
// report from production only and sample traces. NEXT_PUBLIC_VERCEL_ENV is set by Vercel at build time.
// Every error and trace is scrubbed before it leaves (#490, restored #1455).
export function sentryOptions(vercelEnv: string | undefined = process.env.NEXT_PUBLIC_VERCEL_ENV) {
  return {
    enabled: vercelEnv === 'production',
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
    beforeSend: scrubEvent,
    beforeSendTransaction: scrubTransaction,
  }
}
