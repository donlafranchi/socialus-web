# bug #759: the nightly report tap step waits for the sign-in prompt, not a redirect

The tap-speed step "Report: Page menu → report" (signed out) waited for the sign-in page and a URL change. Since #704 a signed-out tap opens the "Sign in to report this" prompt in place, so the step stalled. A stale test, not a product bug: the step now waits for the prompt's Continue button with no URL change. Confirmed by the next nightly; not run locally (the tap-speed project runs against production).
