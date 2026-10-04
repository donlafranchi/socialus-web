# change #344 — a compact contact block

- Hours collapse to one line in the metro's clock: "Open now · Closes 3pm", or "Closed · Opens 8am Fri". A native disclosure opens the week inline, today first and marked (`aria-current="date"`). No modal and no script.
- Links out are one row of icon buttons, each a 44px tap target named for its platform. The website stays one plain link showing its domain.
- The phone stays one tap-to-call link.
- Brand marks are inlined from Simple Icons (CC0), because lucide 1.x dropped brand icons.
- Tests: hoursStatus (7), the disclosure (3), the links row (4). All were seen failing first.
