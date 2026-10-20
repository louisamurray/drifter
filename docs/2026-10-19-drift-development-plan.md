# Drifter: handling and engagement development plan

Date: 19 October 2026  
Status: engineering work for T1–T10 is implemented, checked locally and deployed (game code `87c5469`), and T11's default-handling decision is recorded: legacy stays the default for timed courses. Proposed D1–D3 screens exist in Figma. Every human, physical-device and controller check remains pending, so Gates 1–4 are not passed. A [playtest kit](2026-10-21-gate-closure.md) for the owner's keyboard and iPhone checks is ready. See the [T4, T6–T11 evidence](2026-10-19-activities-t4-t11.md). The requested car park enlargement is implemented. Remaining work continues in the [roadmap](2026-10-21-roadmap.md).

Repository inspected: `dedc31f`.  
Input: [drift physics and engagement research](2026-10-19-drift-physics-and-engagement-research.md).  
Design destination: [Drifter — Design](https://www.figma.com/design/uoKBYYIry5l3BW8FIL2rui/Drifter-%E2%80%94-Design).

## 1. Outcome and scope

Build a web car that players can intentionally initiate, sustain, catch and transition through a drift. Teach that control in untimed practice before introducing one precision-scored corner sequence.

Deliver three playable increments:

1. **Handling prototype:** force-based car, untimed open-lot practice and quick reset, with the existing handling retained for development comparison.
2. **Learning experience:** tuned keyboard and touch controls, analogue controller support, explicit assistance and three optional lessons.
3. **Precision challenge:** one two-corner sequence with clipping zones, controlled transitions and understandable results.

Browser release checks follow these increments. Personal-best ghosts, medals, additional courses, explicit wheel-speed simulation and drivetrain detail remain later work. Native iOS is a physics reference; changing the native application is outside this implementation scope.

This plan changes the original direction in [PLAN.md](PLAN.md): physical handling becomes a development goal, and untimed practice becomes a supported activity. Keep the original plan as historical context and update its current-direction notes when implementation begins. No realistic-car or retention claim follows from this plan alone.

## 2. Evidence and design decisions

### Current implementation

- `src/game/car.ts` requests yaw rate and changes lateral damping during a drift. More tuning of those constants cannot independently establish front/rear tyre behaviour.
- `ios/Drifter/Game/Vehicle.swift` provides a two-axle force model, body-frame velocities, load transfer, combined traction limits and a locked-rear handbrake. Its parameters and assistance still need evaluation.
- `src/main.ts` owns session transitions, physics integration, scoring calls, audio, camera and resets. Changes to the car affect each of those callers.
- `src/core/loop.ts` already provides a fixed-step accumulator; `src/config.ts` currently sets it to 60 Hz. Reuse this infrastructure and assess substeps before changing the global update rate.
- `src/core/mode.ts` chooses the course (`track` or `free`); `src/core/state.ts` chooses the screen state. Both existing courses currently run the timed scoring loop.
- `src/game/scoring.ts` owns both score and countdown. Untimed practice needs an explicit session policy rather than a very large timer or hidden timer display.
- `src/storage.ts` keys best scores by course only. New physics, scoring and assistance could otherwise make incomparable runs share one best.

Initial Figma inspection found one empty page, `0:1` / `Page 1`. Eight editable D1 studies were then created; see the [practice design record](2026-10-19-practice-design.md). A later design session built pages for D1 Practice, D2 Learning and assistance, and D3 Precision challenge, all marked proposed. Preserve the documented visual direction in `docs/PLAN.md`.

### Principles

1. **Teach through the car.** Show the next useful action and its consequence; avoid a permanent telemetry dashboard.
2. **Keep retry cheap.** Reset returns to a predictable starting state without menu navigation or a countdown in practice.
3. **Make control visible.** Applied front-wheel angle, tyre sound and brief feedback should help explain grip loss and recovery.
4. **Preserve the rubber drawing.** Quiet asphalt, Archivo Expanded, restrained cream text and a functional orange accent remain the visual foundation.
5. **Compare like with like.** Physics, scoring, challenge and assistance revisions must be identifiable in scores and test evidence.

| Problem | Proposed response and expected benefit | Evidence or assumption | Trade-off |
| --- | --- | --- | --- |
| Drift behaviour switches through damping and boosts | Use front/rear tyre forces so throttle, steering and slide recovery have a continuous relationship | Code observation; physical-model direction supported by the supplied research | More parameters and numerical validation |
| Timed runs interrupt learning | Add an untimed practice activity on the existing lot | Existing scoring coupling is observed; learning benefit needs playtesting | Another session policy and HUD variation |
| Players may not know why a slide failed | Three optional lessons and one context cue at a time | Design hypothesis | Detection and copy need tuning; cues can distract |
| Absolute slip scoring rewards duration without line precision | Add one ordered corner sequence with line, angle quality and transition measures | Scoring code observation; competition inspiration in the research | More course data and exploit cases |
| Existing scores assume one ruleset per course | Version competitive records before new handling reaches timed runs | Storage code observation | Historical results need a separate presentation |

## 3. Player experience and Figma work

### Recommended journey

Keep **Circuit** and **Free drift** as existing timed choices. Add **Practice** as a clear untimed entry into the lot. Lessons are optional within practice, so a returning player can start driving directly. Introduce the new corner challenge only after its scoring is ready.

| Moment | Player action and system response | Recovery or alternative |
| --- | --- | --- |
| Title | Choose Practice, see the current input hints and assistance setting, then start | Existing timed activities remain directly reachable |
| Practice entry | Spawn stationary on asphalt, facing a clear direction; show one short control cue | No countdown, competitive score or draining timebar |
| Free practice | Drive freely; pause and reset remain available | Grass affects forces; no competitive chain penalty in practice |
| Lesson selection | Choose Initiate, Sustain or Transition; explain one objective before driving | Skip or leave a lesson without losing access to practice |
| Attempt | Show objective progress and a brief success or recovery cue | A spin does not force a modal; offer retry and continue |
| Quick reset | Return immediately to the activity or lesson spawn | Clear held input, physics history and stale feedback; stay in the activity |
| Pause / background | Freeze physics and objective time; suspend audio and release inputs | Resume deliberately; no acceleration caused by a stale held key or touch |
| End practice | Show the session's rubber overview with Practice again and Back to title | No best-score comparison; only explicit exit ends practice |
| Corner challenge | Follow two opposite-direction corners and visible clipping targets | Retry from a consistent start; explain a missed zone or lost control |
| Challenge results | Show total plus line, angle and transition contributions and a concrete loss reason | Retry is primary; overview remains visible; sharing is secondary |

Proposed keyboard reset: **R** during active practice or a challenge. Provide a labelled Reset button for touch. Ignore driving shortcuts while a menu control has focus, and prevent one-thumb touch zones from consuming Reset/Pause presses. Specify whether reset clears session rubber in Figma; recommended default is to clear it for a fresh attempt, while ending practice preserves the overview until leaving it.

### Required Figma frames

Create these in the supplied Design file as proposed screens before their corresponding UI implementation. Start with wireframes for decisions and interruption paths, then apply the existing game's visual direction. Do not build an unrelated component library or redesign the whole game.

| Design task | Frames and states | Needed before |
| --- | --- | --- |
| D1: practice navigation and controls | Desktop title, practice HUD, pause and practice overview; touch portrait equivalents | T4 |
| D2: learning and assistance | Lesson selector, objective cue, progress, success, spin/retry; assisted/reduced-assistance setting and descriptions | T6–T7 |
| D3: precision challenge | Two-corner target layout, active/missed/completed zone states, transition cue, results with loss reason and no previous best | T8–T9 |

For each task, include keyboard focus, muted audio, reduced motion, long text, small viewport and safe-area checks. Desktop shows keyboard/controller hints and hides touch pedals and joystick; touch controls remain above the relevant safe area. Use text or shape as well as colour for target and outcome states. Keep lesson copy away from the car and touch controls. Honour reduced motion for new effects and review existing shake on the affected paths.

Screen acceptance: primary action is clear; the player can identify their activity, pause, reset and leave; target and feedback text stay legible over rubber; controls do not overlap at the smallest supported viewport. Static Figma review establishes layout intent, not usable handling or device accessibility.

## 4. Technical boundaries

### Vehicle and coordinate ownership

Keep the new solver pure and independent of DOM, scoring, course queries and audio. Proposed home: `src/game/vehicle.ts`, with focused tests beside it. Retain the old solver during comparison; choose the model at a development session boundary, never midway through an attempt.

Use metres, seconds, radians, counter-clockwise angles and body-frame velocities inside the new solver. Convert at one integration boundary to the existing pixel-world, clockwise/y-down rendering and course geometry. Document one world-units-per-metre factor and test it. Do not spread scale/sign conversions into camera, audio and input callers.

The boundary must define position, world velocity, heading, yaw rate, forward/lateral speed, signed slip, drift state and applied wheel angle. Add front/rear utilisation or force diagnostics and a clearly labelled approximate wheelspin signal where useful. Rendering and scoring consume documented telemetry, not native state fields by coincidence.

Review downstream thresholds in `config.ts`: speed caps, drift detection, skid/smoke intensity, camera lead, audio speed normalisation, corner lookahead, turn radii and scoring speed scale. A successful port that changes speed units without these consumers is an incomplete port.

### Controls and assistance

Input adapters produce normalised throttle, steer and handbrake requests. Keep direct keyboard/controller steering distinct from the touch stick's desired-heading controller. Apply assistance after input interpretation and before the solver, using explicit parameters.

Preserve one-thumb auto-throttle and corner-lift behaviour through that layer. “Assisted” and “Reduced assistance” use the same vehicle; reduced assistance explicitly disables road-following, automatic corner braking and automatic countersteer, while retaining device input mapping. A one-thumb scheme necessarily supplies automatic throttle: describe this honestly and record the scheme with results. Do not silently change a saved scheme to manual throttle.

For the analogue controller, specify steering deadzone, trigger mapping, device selection and keyboard/touch takeover. Sample inputs on physics steps; neutralise stale values on disconnect, blur, pause and reset. Pause when an actively used controller disconnects. Keep reset and start actions edge-triggered.

### Activity, score and persistence

Add a small session descriptor separating course, activity and ruleset. Suggested activities: existing timed run, practice, lesson and corner challenge. Screen state remains title/countdown/playing/paused/gameover where useful; add states only for distinct transitions that cannot be expressed clearly through session data.

Keep current timed scoring behaviour under its existing rules until the new challenge is introduced. Practice and lessons never invoke competitive score saving. Own completion and optional timing in session rules; avoid parallel countdowns in the HUD and scorer.

Before any new physics timed run can save a best, introduce a record identity containing physics version, scoring version, course/challenge revision, assistance profile and control scheme. Keep legacy keys readable as legacy results without copying them into new leaderboards. Reject malformed/non-finite records and handle storage failures. Challenge results must describe the ruleset that produced them. Changing a competitive tuning parameter requires a ruleset revision.

Ghost persistence is deferred, but the same identity will govern replay compatibility later. Do not build a replay framework now.

## 5. Delivery backlog and gates

Roles below identify responsibilities, not assigned people. Deliver small reviewable changes and keep the game runnable after each task. Sequence by dependency rather than committing calendar dates before the physics spike.

### Phase 0 — establish a baseline

**T1 — Capture the current experience** · Engineering + design · Depends on: none

- Record current configuration, viewport, input scheme, assistance behaviour and scripted input sequences for straight acceleration, steady turn, initiation, countersteer, lift and handbrake release.
- Capture circuit and lot behaviour, reset/restart, title ghosts, audio, grass and the rubber overview. Run the existing repository checks and record their actual results.
- Conduct an initial small moderated baseline with new and experienced drifting-game players using the current build. Record individual observations, not invented aggregate targets. Schedule participant access if unavailable and mark human comparison pending.
- Start D1. Agree the coordinate scale and performance measurement procedure during the technical spike.

**Gate 0:** reproducible baseline fixtures and a written conversion contract exist. No claim that the baseline is authentic or enjoyable is required.

### Phase 1 — force-based car and untimed practice

**T2 — Port and test the solver** · Engineering · Depends on: T1

Status: implemented in `871d6a9`; see [T2 solver evidence](2026-10-19-force-solver-t2.md). The isolated module has 51 new tests and five captured native-reference comparisons. It is not used by the live game yet.

- Adapt the native axle model, tyre curves, load transfer, drag, rolling resistance and rear handbrake into a pure TypeScript module.
- Inspect the native integration and low-speed treatment rather than copying parameters unquestioningly. Test force bounds, finite loads and outputs, stopping and energy behaviour.
- Begin at a matching fixed timestep for cross-platform fixtures. Compare 60 Hz and smaller steps before choosing any production substep count.

**T3 — Integrate the vehicle and diagnostics** · Engineering · Depends on: T2

Status: implemented locally; see [T3 integration evidence](2026-10-19-vehicle-integration-t3.md). Legacy remains the default; force selection is development-only and cannot save competitive bests. Device performance and handling acceptance remain pending.

- Add the unit/coordinate adapter and a development-only model switch that resets the session.
- Integrate surfaces, applied steering visuals, rubber, smoke, speed audio and camera using the telemetry contract. Expose model, input and assist diagnostics in the existing debug tooling.
- Keep the legacy default for existing timed play while the prototype is evaluated. Add record versioning before enabling new-physics competitive saves, including during development.
- Update test drivers only where their controller assumptions depend on the solver; do not weaken physical or on-course assertions simply to make them pass.

**T4 — Ship the practice prototype** · Engineering + design · Depends on: T3, D1

Status: implemented in `fd34adb`; reset after leaving a lesson fixed in `8e10e70`. See the [T4, T6–T11 evidence](2026-10-19-activities-t4-t11.md).

- Add the untimed activity and entry, direct spawn, quick reset, pause, exit and practice overview.
- Centralise reset ownership for car/previous-frame state, input smoothing, load history, camera, objective state, particles, audio and rubber. Reuse existing reset behaviour where applicable.
- Preserve existing timed/free-drift runs and desktop control visibility. Add session integration regressions rather than testing the HUD in isolation only.

**Gate 1:** deterministic and stable manoeuvres; left/right symmetry; grass transitions; correct coordinate conversion; practice can run beyond 60 seconds and reset/pause/exit without saving a best. A manual keyboard walkthrough can initiate and catch a slide. This is the first playable delivery; lessons and precision scoring are not required yet.

Gate 1 status: the engineering checks pass. A person's keyboard walkthrough is still pending; kit check A2 covers it.

### Phase 2 — inputs, assistance and learning

**T5 — Tune input response and assistance** · Engineering + design · Depends on: Gate 1

Status: implemented locally; see [T5 input and assistance evidence](2026-10-19-input-assistance-t5.md). Force-prototype response tuning, analogue controller input, safe takeover/disconnect and explicit assistance profiles are covered by regression tests. Legacy timed handling remains unchanged. T4/Gate 1 and physical-device/human handling acceptance remain pending.

- Tune steering reversal separately from initial turn-in and return-to-centre; compare against the existing roughly 0.8-second ramp to full lock.
- Tune throttle rise/release for binary keys without making digital throttle pretend to be analogue. Add controller analogue input and test disconnection and takeover.
- Tune the touch heading controller and one-thumb automatic driving separately. Keep assistance coefficients explicit and surface the selected profile.

**T6 — Make control legible** · Engineering + design · Depends on: T5, D2

Status: implemented. Applied wheel angle is drawn, squeal follows grip use and wheelspin gives a small pitch rise. The wheelspin cue rarely fires under standard tuning; whether it helps is a human question.

- Draw applied road-wheel steering. Map tyre feedback to available grip/utilisation where telemetry supports it; retain quiet off-road behaviour.
- Use the model's approximate wheelspin signal for a restrained engine cue if it improves comprehension. Do not present it as simulated RPM or add a gear display.
- Keep cues brief and non-essential to driving with sound muted or motion reduced.

**T7 — Add three optional lessons** · Engineering + design · Depends on: T5, T6, D2

Status: implemented in `fd34adb`. The Transition eight was redrawn as two drivable 300-unit loops with a switch window that runs from the end of the left slide (`c6de77a`). All three lessons complete with the real car under both assistance profiles. Thresholds are calibrated against scripted drives only.

- Initiate: reach a suitable speed and create a controlled slide through steering/throttle or a short handbrake pull.
- Sustain: maintain a configurable slip/speed envelope for a continuous interval while moving within the practice area.
- Transition: complete an ordered pair of opposite-direction slides through a marked figure of eight, with a controlled sign change and continued progress.
- Put lesson envelopes, durations and reset points in data. Use deterministic, debounced evaluators; reject stationary rotation, spins and repeated boundary flicker as completion. Calibrate thresholds through the prototype and observed attempts.

**Gate 2:** regression checks cover each input and assistance profile. Moderated comparison establishes whether players can repeat a slide, connect directions and explain a loss of control. Resolve blocking comprehension or recovery failures before precision scoring. Set numeric playtest targets after baseline observations, then freeze them before the next comparison.

Gate 2 status: regression checks cover each input and assistance profile. The moderated comparison has not happened, so Gate 2 is not passed. Kit checks A3, A4, B4 and B5 record the owner's observations, which do not replace sessions with new players.

### Phase 3 — one precision-scored corner sequence

**T8 — Define the course and deterministic evaluator** · Engineering + design · Depends on: Gate 2, D3

Status: implemented ahead of Gate 2, because Gate 2 depends on people. The course is `s-bend-2`: the first corner was mirrored to bend left, as the evaluator expects (`ef98485`). Scoring `precision-2` records reconciled score events (`edfae10`). A recorded real-car drive and exploit drives verify it (`b72b497`).

- Author two opposite-direction corners with ordered entry/exit gates, clipping points and outer zones. Reuse existing geometry utilities where appropriate.
- Define forward progress from ordered gates and along-course movement; use swept movement checks or equivalent to avoid skipping a small zone between steps.
- Award line quality once per valid zone passage, angle quality within a corner-specific envelope, and one transition bonus for a valid ordered direction change. Require speed/progress and exclude spins. Prevent repeated zone entry farming and sign jitter bonuses.
- Freeze a versioned scoring definition with weights, target ranges, invalidation and completion rules. Verify it with recorded input/telemetry fixtures before polishing results.
- Keep existing lot scoring unchanged; deliberate donut practice must remain possible.

**T9 — Explain the result and enable comparable bests** · Engineering + design · Depends on: T8, D3

Status: implemented. Results show contributions, the first loss reason (including an early finish) and the ruleset. Bests are keyed by physics, scoring, course, assistance and controls.

- Show total, line/angle/transition contributions and the first actionable loss reason. Totals must reconcile with evaluator events.
- Add retry, overview and correctly labelled best/no-best states. Use the record identity defined above; separate assisted and reduced-assistance results.
- Preserve the rubber share composition and handle unavailable sharing without losing the result or retry path.

**Gate 3:** identical input fixtures produce identical score events; a clean linked sequence beats exploit fixtures under the frozen rules; results explain the difference. Human sessions check whether the feedback suggests a useful next attempt. Approval of scoring weights depends on this evidence, not their visual polish.

Gate 3 status: the fixture, exploit and explanation checks pass. Human sessions are pending. Kit checks A5, A6 and B6 record the owner's attempts and a scoring-weight decision.

### Phase 4 — browser release and adoption

**T10 — Complete regression and performance evidence** · Engineering · Depends on: Gate 3

Status: the required checks pass, and desktop frame cost and bundle size are recorded. `?debug` now shows frame timing. Touch-hardware, phone frame-rate and controller checks are pending.

- Run lint, typecheck, all unit tests, format check and production build using the repository scripts.
- Recheck title ghosts, both existing timed courses, lessons, challenge completion, pause/resume, reset, share, storage failure, muted audio, blur, resize and input-device changes.
- Measure new physics and rendering on desktop plus representative touch browsers; compare frame cost, allocations and responsiveness with the baseline. Test existing 60 fps and bundle budgets rather than claiming them from a successful build.
- Test real touch hardware for reach, safe areas, audio unlock and performance. Browser emulation does not establish those results.

**T11 — Choose defaults and release** · Product/design + engineering · Depends on: T10 and human gates

Status: decided to keep legacy handling as the default for Circuit and Free drift until human comparison evidence exists; the force model stays in practice, lessons and the challenge. README, the original plan and a [change note](2026-10-19-change-note.md) are updated. `main` is deployed to GitHub Pages.

- Decide from comparison evidence whether the new model should become the default for existing timed courses. Keep the prototype available if it is stable but not yet preferable.
- If adopting it, preserve existing course choices and timed rules, version their bests, retune the title drivers and publish a short change note covering handling, assistance and historical scores.
- Update README and original-plan current-direction notes to distinguish current behaviour from legacy tuning advice. Keep a reversible release path to the previous default; never merge incompatible results during rollback.

**Gate 4:** required checks pass, human findings and hardware evidence are recorded, blocking issues are resolved, and the default-handling decision is explicit. Multiplayer, a garage, online accounts and new content are not release dependencies.

Gate 4 status: the required checks pass and the default decision is explicit. Human and hardware evidence is missing, so Gate 4 is not passed. Kit checks A7 and B1–B8 cover the owner's iPhone; no Android phone, tablet or controller is available yet.

## 6. Verification matrix

| Area | Required regression and neighbouring flows |
| --- | --- |
| Physics | Identical sequences; mirrored turns; load and traction limits; low-speed stop; finite values through spins; handbrake hold/release; throttle lift and countersteer; grass/asphalt transitions |
| Integration | Unit/sign conversion, equivalent native/web manoeuvres with declared tolerances; timestep convergence; no artificial kinetic-energy growth in unpowered, unassisted scenarios within numerical tolerance |
| Input | Press/release/reversal, simultaneous keys, throttle smoothing, touch heading wrap, one-thumb behaviour, gamepad deadzones/disconnect/takeover, focus and blur |
| Session | Practice beyond timed duration; reset while drifting or holding input; pause and background time; repeated retry/exit; no practice best writes; old timed completion remains intact |
| Scoring | Straight driving, clean linked sequence, excessive angle/spin, backwards motion, stationary heading changes, zone skipping/re-entry, sign jitter, wrong gate order, completion once and no score after finish |
| Persistence | Legacy records, new identity separation, changed physics/assistance/challenge versions, malformed data, unavailable storage and rollback |
| Presentation | Desktop hides touch controls; accurate hints; small/tall/wide screens; focus; muted/reduced-motion feedback; camera and rubber overview; title ghosts and share fallback |

Tests should assert physical invariants and observable session outcomes. Existing assertions that encode a guaranteed lift-to-recover arcade behaviour need deliberate replacement for the new model while remaining valid for the legacy model. Every implementation fix must include a regression for its root failure and checks of nearby flows.

## 7. Playtest and decision record

Run the baseline and prototype with new players and experienced drifting-game players. Record actual participant count, input device, assistance, build/configuration and task order; alternate handling order where practical to reduce learning bias. This is a proposed study, not completed research.

Tasks: make one slide, repeat it intentionally, catch excessive rotation, connect opposite directions and improve one challenge attempt after reading results. Record time to first success, repeat success, transition completion, explanation of loss, responsiveness/predictability ratings and willingness to retry. Preserve individual failures as well as summaries; a small sample supports iteration rather than a retention claim.

Maintain a decision log in implementation evidence with: observation, severity, implicated mechanism, proposed change, affected ruleset, test, human follow-up and outcome. Where a gate has insufficient evidence, record it as pending rather than silently treating it as passed.

## 8. Execution order and immediate next step

Critical path: **T1 → T2 → T3 → T4 → Gate 1 → T5 → T6/T7 → Gate 2 → T8 → T9 → T10 → T11**. D1–D3 can be prepared ahead of their dependent engineering work. T6 and T7 share telemetry and copy decisions; agree those before splitting their implementation.

T1's engineering capture and conversion contract are recorded in the [handling baseline](2026-10-19-handling-baseline.md). [T2](2026-10-19-force-solver-t2.md), [T3](2026-10-19-vehicle-integration-t3.md), [T5](2026-10-19-input-assistance-t5.md) and [T4, T6–T11](2026-10-19-activities-t4-t11.md) are implemented and locally verified. The car park is 2,700 × 3,900 world units; its title demo remains a central figure of eight.

The next step is people, not code:

1. Run the [playtest kit](2026-10-21-gate-closure.md): the owner's keyboard walkthrough, lessons, challenge attempts and iPhone checks. It can close Gate 1's walkthrough and Gate 4's iPhone checks.
2. Run the human baseline and the moderated Gate 2 and Gate 3 sessions with new and experienced players. Use the decision log in the T4–T11 evidence, and set numeric targets before tuning.
3. Measure on an Android phone, a tablet and a controller, with `?debug` frame timing.

The D2 eight and D3 course were checked against the shipped geometry on 21 October. The D3 hand matches; both drawings still differ in shape or scale, which the [design check](2026-10-21-gate-closure.md#design-check-d2-eight-and-d3-course) leaves to the owner.

Revisit the default handling only with that evidence. No delivery dates are committed here. The [roadmap](2026-10-21-roadmap.md) takes these steps on as Phase 5 and continues through release, new content and online play.

Later priorities, conditional on playtesting: personal-best ghost with compatibility checks, short medal challenges and additional corner sequences. The roadmap schedules these in Phase 7. Add explicit wheel angular speed/slip ratio only when a measured handling or feedback limitation justifies it.

## 9. Planning artefacts and evidence limits

- This Markdown file is the detailed development plan; the supplied research remains the external-source record. This task did not revalidate those public sources or add new external factual claims.
- The supplied Figma Design file was initially empty. A later session added proposed D1, D2 and D3 pages, a brand guide, foundations and components. Their approval and runtime or device validation are outstanding. This plan's implementation changed the challenge's hand and the lesson eight after those pages were drawn; a later check found the D3 hand matches, while the course shape and the eight's scale differ.
- A FigJam dependency/gate diagram was submitted through Figma. Generation requires a team/organisation selection in the Figma widget; a completed board URL is not yet available. The source diagram is retained in [drift-development-sequence.mmd](drift-development-sequence.mmd).
- Writing the original plan did not change gameplay or run tests. Later work added baseline fixtures, the larger car park, the T2 solver, its integration, input and assistance, practice, lessons, the challenge, and release checks, each with its own evidence record. Human and device playtests remain pending, and each delivery gate still needs its human evidence.
