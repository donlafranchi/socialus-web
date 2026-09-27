# bug #225 — the Page-ID uniqueness test no longer fails at random

The test asserted that 2000 draws from `new_page_public_id()` were all distinct. A fair 32⁶ generator collides about 1 run in 530. It now allows up to 10 collisions: a fair generator exceeds that with p ≈ 2 × 10⁻³⁸, and a generator with only three random characters always does (~60).

Red first: a fair 2000-id sample holding one collision was rejected by the old rule. A new case, in the suite every run, shows the bound rejecting the 32³ generator.
