// #993 — see aborted-fetch.test.ts. A navigation that interrupts a read logs "Failed to fetch".

export const abortedByNavigation = (consoleText: string, abortedRequests: number) =>
  abortedRequests > 0 && /TypeError: Failed to fetch/.test(consoleText)
