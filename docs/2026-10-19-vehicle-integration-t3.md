# T3: vehicle integration through the unit/coordinate adapter

Date: 19 October 2026

T3 is implemented locally. Legacy handling remains the default. Force handling is available only in the development server with `?debug`: open **tune**, then select **Force prototype · no best saves**. Selecting either model returns to title and resets the session. Reloading returns to legacy; model selection is not persisted. Production builds expose no model selector.

## Ownership and conversions

`src/game/handling.ts` owns the solver state and its world projection. It implements the [T1 conversion contract](2026-10-19-handling-baseline.md): 10 world units per metre, inverted y/heading/yaw/steering/slip signs, and body-to-world velocity rotation with no heading offset. Native force/load history stays in the solver between steps; importing the projection each frame would discard that history.

The web loop and input sampling remain at 60 Hz. Each force update uses two 120 Hz substeps with the same sampled demand. Legacy updates still call the unchanged solver once at 60 Hz. Position interpolation uses the previous and current web projections, covering the full web step.

Telemetry supplies web-unit forward/lateral/total speeds and signed slip. Existing scoring, smoke, rubber and body roll keep their world-unit thresholds. Camera and speed audio use a reference speed of 360 world units/s for legacy and 380 for force. Front wheels now consume clockwise radians: legacy retains its requested-steer × 0.42 presentation; force shows the solver's applied wheel angle, including speed limiting and assistance.

## Surfaces and assistance

Force handling explicitly selects `ASPHALT` or `GRASS`; it does not reinterpret legacy drag/damping multipliers as tyre coefficients. Legacy keeps its original surface configuration.

The existing road-following yaw request becomes a bicycle steering angle using wheelbase and forward speed. This operates only on forward-moving asphalt with no meaningful steering demand; the existing touch-stick ownership rule still disables the request. Corner lookahead, radius, corner-speed and lift-band parameters retain their current world-unit policy. Corner lift is passed to the force solver as its explicit throttle reduction/service-brake assist; manual pedals continue to disable automatic corner lift. Open-lot driving has neither road following nor corner lift.

Force countersteer assistance is explicitly 1; this is an assisted prototype, not a reduced-assistance profile. Input/assist tuning and selectable profiles remain T5 work. Debug output shows sampled input (including ghost/autopilot demand), model, applied wheel angle, road steering/lift/countersteer, axle slip, vertical loads, force magnitudes and labelled approximate wheelspin. Legacy physics sliders are labelled separately from the shared road-assist policy.

## Session and records

Model changes, restart and course changes reset solver history, previous projection, input smoothing/held demand, camera, presentation state, shake, particles, rubber, laps and score through the existing reset owner. Camera/shake/presentation now reset immediately rather than easing out of a previous session.

Force runs still use the current timed scoring loop for development evaluation. They cannot update either in-memory or persisted bests. Their title hides legacy best comparisons, results say **Handling prototype · best not saved**, and share text labels the score experimental. Legacy saves remain unchanged. Competitive record identity/versioning must be implemented before this restriction can be removed; this task does not enable force competitive records.

Untimed practice, quick reset and its navigation remain T4; native iOS is unchanged. Existing title/test drivers have not been retuned and all legacy course/handling assertions remain intact. Force ghosts currently reuse those drivers; their handling quality is not accepted by the legacy driver tests.

## Verification

- Initial lint, typecheck, 194 tests across 20 files, production build and changed-file formatting pass. At the commit refresh, source lint (`npx eslint src`), typecheck, all tests and build pass; repository-wide lint is blocked by an unrelated ignored file, `.remember/tmp/last-ndc.ts`, outside the TypeScript project. That file is unchanged.
- Conversion regressions cover cardinal axes, quadrants, heading wrap, body/world velocity round trips and clockwise right turns with mirrored left turns.
- Adapter replay matches direct 120 Hz force integration through acceleration, steering reversal, handbrake, lift, grass and asphalt transitions. Reset replay matches a fresh solver; legacy replay remains identical through its surfaces and assists.
- A session integration test boots the actual main/HUD/input/scoring path with canvas/audio/loop doubles, switches models, drives, pauses, restarts, checks neutral input and proves that a forced high prototype result cannot save while a legacy result can. Camera, prototype result labels and development selector have focused regressions.
- Desktop Brave smoke check at 1352 × 766 CSS pixels / DPR 2: selected force handling, entered the open lot, accelerated with W, steered right then left, crossed onto grass and paused. Live diagnostics, applied wheels, course rendering and camera remained active; pause displayed correctly. This was a short keyboard/runtime check, not evidence of a reliably initiated/caught drift or sound quality.

Pending: sustained human handling evaluation, touch/mobile checks, frame-cost/device measurements, and the Gate 1 initiate/catch walkthrough after practice/input work. The 120 Hz substep choice is the numerical-test candidate from T2, not a device performance claim. No authenticity, enjoyment or release acceptance follows from these checks.
