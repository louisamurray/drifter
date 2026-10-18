# Drifter: handling baseline and conversion contract

Captured on 19 October 2026 against `1aca920`, before the requested car park enlargement. This is T1 engineering evidence for the [development plan](2026-10-19-drift-development-plan.md). Human playtesting remains pending.

## Reproduce the capture

```sh
npm test -- src/game/legacy-baseline.test.ts
```

The test contains seven manoeuvres, with each segment expressed as an integer number of 60 Hz input/physics frames. It uses the shipped manual keyboard adapter (`resolveControls` and `advanceControls`), a fresh zero-input state and a car at `(0, 0)` facing positive x. Road assist and automatic corner lift are zero. Surface changes are scripted, rather than inferred from course position. No viewport participates in these pure solver fixtures.

The [original configuration and input sequences](evidence/2026-10-19-baseline-config.json) preserve the pre-enlargement setup, including the 1,800 × 2,600 lot. The committed Vitest snapshots retain segment-end car/input/telemetry values and manoeuvre summaries. The configuration assertion covers the solver, loop, inputs and surfaces; unrelated course/palette changes do not invalidate a handling fixture. Numerical snapshots are rounded to six decimal places; a second replay must also match exactly in the same runtime. Each manoeuvre is mirrored through keyboard inputs and checked for symmetric position, heading, yaw and speed.

These are legacy observations, not handling targets for the force-based solver. Do not update them to accept a different solver; preserve the legacy path and compare separately.

## Measured legacy response

All scenarios start with 180 frames / three seconds of full gas. Subsequent segments use the real digital steering ramp. Speeds below are world units per second; slip is the maximum absolute body slip in radians across the complete sequence.

| Manoeuvre after acceleration | Further input | Final speed | Drift time | Maximum slip |
| --- | --- | ---: | ---: | ---: |
| Straight acceleration | None | 360.000000 | 0 s | 0 |
| Sustained turn | Gas + right for 360 frames | 135.884885 | 5.466667 s | 1.103178 |
| Full-lock initiation | Gas + right for 120 frames | 123.480944 | 1.466667 s | 1.103178 |
| Countersteer | Initiation, then gas + left for 60 frames | 319.809657 | 2.050000 s | 1.103178 |
| Lift and release | Initiation, then release all keys for 180 frames | 0 | 1.633333 s | 1.103178 |
| Handbrake pull and release | Right + handbrake, no gas, for 30 frames; then gas only for 120 | 360.000000 | 0 s | 0.551415 |
| Asphalt → grass → asphalt | Gas + right on grass for 120 frames; gas only on asphalt for 120 | 360.000000 | 0.366667 s | 1.085882 |

The handbrake scenario reaches about 31.6 degrees of slip but never sets the legacy `drifting` flag. At the end of the pull its lateral speed is about 68 world units/s, below the configured 70-unit entry threshold. This explains the fixture outcome; it is not a new bug fix or evidence that a human cannot initiate with the handbrake.

## Baseline checks and flow coverage

Environment: Node `v26.4.0`, existing installed dependencies. Before new tests or gameplay changes:

| Check | Result |
| --- | --- |
| `npm run lint` | Passed |
| `npm run typecheck` | Passed |
| `npm test` | 104 tests across 14 files passed |
| `npm run build` | Passed; JS 53.87 kB / 18.57 kB gzip; CSS 11.68 kB / 3.25 kB gzip; bundled font 14.56 kB |
| `npm run format:check` | Failed on four existing iOS files: three asset-catalog JSON files and `ios/project.yml`; left unchanged |

Existing circuit and lot pilot tests ran as part of that suite. Circuit coverage checks lappability and grass slowdown. Lot coverage checks its figure-of-eight pilot remains on asphalt, drifts and visits both halves. Existing input/HUD/scoring/storage tests cover control resolution, desktop hints, pause/confirm handling, chain/timer behaviour and persistence. They do not constitute a complete browser session test.

In this task, the desktop title was inspected in Brave at `http://127.0.0.1:5176/`: the moving circuit scene, keyboard hints and hidden touch controls were visible. Free drift and one-thumb selection were exercised. Enter while a scheme button retained focus did not launch a run; clicking the title start action entered the countdown. A full live lot run, physical simultaneous-key test, audio listening check, restart and share flow were not completed in this task. The shared browser became active on unrelated work, so further native UI input was stopped.

The existing [browser-verification handoff](../.codex/handoff/2026-10-19-1010-browser-verification-results.md) records earlier Enter/pause/restart/game-over and touch-emulation observations. Those are prior-run evidence, not fresh measurements here. No physical device or new human participant was tested.

## Unit and coordinate contract for T2–T3

Use **10 world units per metre**. This matches the native configuration's documented mapping, web/native car lengths of 40 units / 4 m, road widths of 130 units / 13 m, and the original lot dimensions of 1,800 × 2,600 units / 180 × 260 m. The enlarged web lot will be 270 × 390 m under the same contract; that does not enlarge the native lot.

Keep the solver in metres, seconds, radians, y-up and counter-clockwise angles. Convert once at its boundary with the existing web world. Let `S = 10`, native heading be `θ`, native body velocities be `u` forwards and `v` leftwards, and native yaw rate be `ω`:

| Quantity | Solver → web | Web → solver |
| --- | --- | --- |
| Position | `xW = S*x`, `yW = -S*y` | `x = xW/S`, `y = -yW/S` |
| Heading | `headingW = -θ` | `θ = -headingW` |
| Yaw rate | `yawRateW = -ω` | `ω = -yawRateW` |
| World velocity | `vxW = S*(u*cos(θ) - v*sin(θ))`; `vyW = -S*(u*sin(θ) + v*cos(θ))` | Convert world velocity back to y-up, then rotate into the solver body frame |
| Body telemetry | `forwardW = S*u`; `lateralW = -S*v`; `speedW = S*speed` | Divide speeds by S, negate lateral component |
| Signed slip / applied road-wheel angle | Negate; angular magnitudes keep their units | Negate |
| Steering request | Web right-positive request becomes solver left-positive by negation | Negate |
| Throttle and handbrake | Preserve normalised throttle and Boolean handbrake | Preserve |
| Radius / lookahead / distance | Multiply by S | Divide by S |

Wrap angles consistently for comparisons, without introducing a 90-degree offset: both conventions define zero along positive x. Test axes, quadrants, a heading wrap and round trips. A positive web steering request must turn clockwise on screen.

**Course comparison caveat:** `src/main.ts` overrides the web circuit's definition scale with `config.track.scale = 1`. Native circuit scale is `0.08`, with y negated. At S=10, its centreline is therefore 80% of the shipped web centreline's size; road width still matches. Use the same explicit centreline fixture for parity tests. Do not change the shipped circuit to hide that difference.

**Timestep contract:** native fixed dt is 1/120 s; web fixed dt is 1/60 s. Begin solver parity checks at 1/120 on both sides with identical physical-duration input events. Retain the 60 Hz web session/input loop initially; evaluate two solver substeps against a single 60 Hz step before selecting production integration. A frame count from these 60 Hz legacy fixtures must be converted to elapsed time before replay at another rate.

**Assistance contract:** compare raw physics with road-following, auto braking and countersteer gains explicitly zeroed. The native `DriveAssist.none` default retains countersteer (`counter = 1`), so its name is insufficient evidence that assists are disabled. Keep the touch desired-heading controller outside the solver.

**Consumer audit for T3:** camera and audio currently normalise by the legacy `config.physics.maxSpeed`; front-wheel rendering uses requested steer; tyre sound/smoke/rubber use lateral-speed signals. Expose model-specific reference speed and applied wheel angle through the integration boundary. Convert forces/surface parameters deliberately; the legacy damping multipliers are not tyre friction coefficients. Scoring remains in web units until a separate versioned rule change.

## Performance measurement procedure

On the same build, device, viewport, DPR and input/assist profile, run a warm-up followed by repeated 60-second circuit and lot sessions. Record physics update cost, render cost, frame intervals, long frames, heap/allocation behaviour and bundle size. Use the same recorded input schedule for legacy and candidate comparisons; keep debug overlays consistent. Compare an active follow view with the whole-lot overview, where the full rubber layer is composited.

Record 60 Hz and high-refresh desktop results, then physical Safari/iPhone and Chrome/Android results separately. Include browser/OS/device identity and measurement method. The existing rubber layer lowers resolution as world area grows; inspect visual sharpness as well as memory. No frame-time or device performance baseline was measured in this task; build sizes and test durations are not substitutes.

## Continuation state

- Gate 0's engineering artefacts exist: reproducible fixtures, saved configuration and this conversion contract.
- Human baseline, full fresh browser flow and physical input/device checks remain pending. No participant access or external messages were arranged.
- Next engineering task is T2: implement and test the isolated force solver. D1's first layout studies are recorded separately. Do not treat either as acceptance of new handling.
