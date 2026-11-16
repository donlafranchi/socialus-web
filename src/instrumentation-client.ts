import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: 'https://811834b36b11d184f31dcb0c4bf3c42f@o4512442541539328.ingest.us.sentry.io/4512442590363648',
  tracesSampleRate: 1,
  dataCollection: { userInfo: false, httpBodies: [] },
})

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
