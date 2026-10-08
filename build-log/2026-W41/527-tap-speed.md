### chore #527 — tap speed, measured on a phone on 4G

`evals/speed/` times every tap on production with a mid-range phone (Pixel 7 at 4x CPU, 4G): feedback, URL change, content usable, read-only. Budgets in `src/lib/speed/judge.ts`: consumer 100 ms / 1 s, creator 250 ms / 2.5 s. Runs nightly after the live smoke; fails on a stall, a screen that never shows, or a slowdown past `baseline.json`.

First run (signed out): opening a Page from Explore took 2.2 s with the URL changing only at 2.2 s, so the card moved and nothing else did. Causes: no loading screen on `/g/[handle]`, and the owner's composer pulled the 480 KB map library into every visitor's Page. Fixed here, with the Page skeleton and `/` forwarded at the edge instead of a server render (about a second). The rest is filed in the beta milestone.
