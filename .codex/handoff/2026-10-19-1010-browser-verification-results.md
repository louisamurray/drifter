# Handoff — browser verification results
19 October 2026, 10:10 NZDT (Pacific/Auckland) · `/Users/louisamurray/Developer/vscode/drifter` · branch `main`

## Unfinished work
1. [pending] Optional physical-input acceptance — check simultaneous gas, steering and handbrake with a real keyboard, and touch operation on a physical device. Native computer-use rejects chords containing multiple ordinary keys; browser emulation establishes presentation only.

## Context

**Goal.** Continue `2026-10-19-1003-desktop-browser-verification.md` and verify desktop controls and touch presentation. No physics implementation was authorised.

**Completed and verified.**
- Brave at `http://127.0.0.1:5176/`: Enter starts a countdown, resumes from pause, and retries from game over. Restart from pause starts a fresh countdown.
- Held W moved the car and held A changed its heading. Space was exercised, but its isolated physical effect was not measured. Held P and Escape each left the game paused after a 1.5-second press.
- Desktop gameplay hides joystick/pedals and displays manual-throttle keyboard hints. One-thumb title shows Auto accelerate; two-thumb title shows W/Up for gas. Enter on a focused scheme button remains on the title screen.
- iPhone 16 browser emulation at 393 × 852 retains one-thumb title/gameplay steering cues and two-thumb title/gameplay gas, brake and joystick. Desktop presentation restored afterwards; preview left on title.
- `npm test -- src/core/input.test.ts src/render/hud.test.ts`: 29 tests across 2 files passed. Existing cases cover concurrent gas/steering, gas/handbrake, independent releases, repeat suppression, focused controls and blur. This is automated input-layer evidence, not a live three-key keyboard test.
- `git diff --check` passed before this document. No application code changed.
- During verification HEAD advanced from `cdde60e` to `fb6bae8 feat(research): add drift physics and engagement research documentation`; this was an external change, preserved. It records the original two handoffs and research. Tracked workspace was clean after that commit.

**Next step.** If physical-input acceptance is wanted, manually hold W+A+Space in two-thumb mode and check throttle, turn and handbrake together, then test touch on a physical device. Browser presentation checks are complete. Do not begin physics implementation without user direction.

**Key files and paths.**
- `src/core/input.test.ts`, `src/render/hud.test.ts` — current input and hint regression coverage.
- `docs/2026-10-19-drift-physics-and-engagement-research.md` — preserved research recommendations.
- `.codex/handoff/2026-10-19-0958-drift-physics-and-engagement.md` — original implementation context and earlier full checks.

**Decisions and gotchas.**
- No commit/push requested or performed by this continuation.
- Preview server started with approved sandbox escalation, tool session `34356`, port 5176 (5174/5175 occupied). Recheck availability later.
- Browser connector inventory empty; used native Brave controls. Browser interaction was interrupted once by a user tab switch, then resumed with explicit permission.
- In device emulation an AX-index click landed incorrectly; screenshot coordinates worked. Do not treat that automation discrepancy as a game bug.

**How to verify.**
```sh
npm test -- src/core/input.test.ts src/render/hud.test.ts
git diff --check
git status --short --branch
```
