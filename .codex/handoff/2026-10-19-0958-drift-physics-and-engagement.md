# Handoff — drift physics and engagement

19 October 2026, 09:58 NZDT (Pacific/Auckland) · `/Users/louisamurray/Developer/vscode/drifter` · branch `main`

## Unfinished work

1. [pending] Browser verification of desktop keyboard controls — automated checks passed, but no browser was available through the computer-use tool. Verify actual desktop gameplay and touch-device presentation when a browser is available.

## Context

**Goal.** The user requested desktop keyboard controls, then investigated making the game more fun and engaging with drift physics closer to the real world. Research is complete and saved. Gameplay implementation of the research recommendations has not been requested or started.

**Completed and verified.**

- Desktop controls and hints are present in current HEAD `cdde60e feat(input): add desktop keyboard controls and hints for gameplay`. This commit was observed during handoff inspection; this agent did not create it in the recorded conversation.
- Enter starts, retries or resumes. A/D or left/right steer; W/up is gas in the manual scheme; Space/S/down is handbrake; Esc/P pauses or resumes. Pause/confirm ignore key repeat. Keyboard handling respects focused form controls and browser modifier shortcuts; held keys release on blur.
- Latest explicit user direction: desktop **should not show the joystick or touch pedals**. An earlier message saying it should was immediately corrected. CSS hides touch cues for `(hover: hover) and (pointer: fine)` and displays keyboard hints; touch devices retain their controls.
- Existing control schemes remain: one thumb uses automatic acceleration; two thumbs uses manual throttle. Keyboard support existed partly before this session and was extended.
- Verification during implementation: 104 tests across 14 files passed; production build, lint, changed-file Prettier check and `git diff --check` passed. No native tests ran in this session.
- Impeccable detector reported only the pre-existing bounce-easing setting at `src/style.css:15`; it was preserved outside scope.
- Research saved at `docs/2026-10-19-drift-physics-and-engagement-research.md`. Its Prettier check and `git diff --check` passed. At handoff inspection it is the only untracked file; there are no tracked modifications.

**Next step.** Read the research document and check current Git status. If continuing the desktop feature, perform the pending browser check. If the user requests physics implementation, start with the document's first slice: a force-based web car and untimed practice lot. Do not interpret the research recommendation as an existing instruction to implement it.

**Key files and paths.**

- `docs/2026-10-19-drift-physics-and-engagement-research.md` — sourced findings, evidence boundaries, recommendations, implementation sequence and verification plan.
- `docs/PLAN.md` — original arcade-first design; realistic physics was originally a non-goal, superseded as a research direction by the user's latest request.
- `src/game/car.ts`, `src/config.ts` — current arcade physics: direct target yaw, lateral damping and drift-dependent boosts.
- `src/core/input.ts`, `src/core/input.test.ts` — touch/keyboard input and desktop event regressions.
- `src/main.ts` — state transitions, keyboard callbacks, physics/assist integration.
- `src/render/hud.ts`, `src/render/hud.test.ts`, `src/style.css` — keyboard hints and desktop/touch presentation.
- `src/game/scoring.ts`, `src/audio/mapping.ts` — current angle/speed/duration scoring and speed-based engine sound.
- `ios/Drifter/Game/Vehicle.swift`, `ios/DrifterTests/VehicleTests.swift` — existing two-axle force model and native vehicle scenarios.

**Decisions and gotchas.**

- Research conclusion: adapt the native force model as a web baseline, then add precision challenges. Merely changing arcade grip constants will not supply the same causal handling.
- Native already models separate front/rear tyre forces, longitudinal load transfer, traction sharing, a rear handbrake and countersteer assistance. It is an approximation with tuned parameters, not a validated real-car simulation; explicit wheel angular-speed dynamics are absent.
- Porting requires explicit conversion: native metres, y-up, counter-clockwise angles versus web pixel units, y-down, clockwise angles. Native physics runs at 120 Hz; web currently runs at 60 Hz. Validate timestep stability and performance rather than assuming parity.
- Keyboard steering currently takes about 0.8 seconds to reach full lock; countersteer response and binary throttle need evaluation with physical handling. Touch desired-heading controls and direct keyboard steering require distinct input/assist tuning.
- Proposed engagement order: untimed practice and lessons; clipping zones; clean-transition bonuses; angle quality/progress checks; personal ghosts and corner results; short medal challenges. Preserve intentional donut practice in the lot.
- Engagement benefits are hypotheses. Automated drivers establish bounded drivability, not authenticity, enjoyment or retention. Compare handling variants with human players before expanding content.
- Version scores/ghosts when changed physics or scoring makes old runs incomparable.
- No physics/gameplay changes were made during the research. The untracked research document should be preserved; no commit or push was requested.
- A local preview server was started on `http://127.0.0.1:5174/` (tool session 38169). It may no longer be running. Port 5173 was occupied. In-app browser was unavailable and browser inventory was empty. Initial sandbox bind failed with EPERM; approved escalation allowed the server to start.
- Follow the user's supplied AGENTS rules: identify root causes and downstream effects, make the smallest safe change, preserve unrelated work, and add regression coverage for fixes.

**How to verify.**

```sh
git status --short
npm test
npm run build
npm run lint
npx prettier --check docs/2026-10-19-drift-physics-and-engagement-research.md
git diff --check
npm run dev -- --host 127.0.0.1
```

Browser checks: Enter starts from title; gas/steering/brake work simultaneously; holding Esc/P toggles once; resume and retry work; desktop hides stick/pedals and shows scheme-correct hints; touch layout retains its controls; focused settings controls retain normal keyboard behaviour.

Public source links and dates are in the research document. No recurring research monitoring was recommended.
