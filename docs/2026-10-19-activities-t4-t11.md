# T4, T6–T11: practice, lessons, challenge and release evidence

Date: 19 October 2026
Status: engineering work for T4 and T6–T10 is implemented and checked locally. T11's default-handling decision is recorded below. Every human, physical-device and controller gate remains pending. Nothing here establishes that the handling feels authentic, that the lessons teach, or that players will come back.

Builds on [T2](2026-10-19-force-solver-t2.md), [T3](2026-10-19-vehicle-integration-t3.md) and [T5](2026-10-19-input-assistance-t5.md). Commit `fd34adb` added the activities; branch `feat/complete-drift-plan` fixes and verifies them, then completes the release checks.

## What exists

**Session.** `src/game/session.ts` separates activity (`timed`, `practice`, `lesson`, `challenge`) from course and handling model. Timed runs keep the legacy model and their existing scorer. Practice, lessons and the challenge use force handling on the open lot. The scorer is never consulted outside timed runs.

**Practice (T4).** Practice sits beside Circuit and Free drift on the title. It has no countdown, timer or score; Reset (R, controller Y, or the Reset button) returns to the spawn and clears rubber. Pause freezes the attempt, and End practice shows the rubber overview with Practice again, Back to title and Share drawing. `resetRun` owns the car, previous-frame state, input and smoothing, solver history, camera, objectives, smoke, shake, audio and rubber. Leaving a lesson for free practice now also moves Reset to the practice spawn (`8e10e70`).

**Legibility (T6).** Front wheels draw the applied road-wheel angle. With force handling, tyre squeal follows axle grip use (force over available grip) rather than lateral speed, and stays silent off the asphalt. Approximate wheelspin raises engine pitch by up to 6%. It is labelled approximate and there is no RPM or gear display. Activity cues are static text and work with sound off. The only screen shake remains on timed scoring and respects reduced motion.

**Lessons (T7).** Initiate, Sustain and Transition live in `LESSONS` with their objectives, envelopes, durations, spawns and, for Transition, the marked eight and switch window. Evaluators need real movement, at least 70 units/s, forward travel, 0.2–0.95 rad of slip, yaw below 3.5 rad/s and the asphalt. Any break in the slide restarts progress, so stationary rotation, spins and boundary flicker cannot complete a lesson.

**Challenge (T8).** `src/game/challenge.ts` defines course `s-bend-2` and scoring `precision-2`: Start, Outer 1, Clip 1, Switch, Outer 2, Clip 2 and Finish, crossed in order with swept segment checks. Points come only from score events:

- Line: 500 per scored zone crossed inside the gate while sliding the corner's way.
- Angle: up to 1,500 per corner, from slip near 0.5 rad while near the line and moving forward. It is committed as one event when the corner closes.
- Transition: 600 once, for a right slide held 0.25 s after a valid left slide.

A spin or run-wide revokes that corner's awards and the transition with negative events, so the events always sum to the total. A 60 s limit, teleport and non-finite checks, and early ends all settle the attempt with a reason.

**Results and records (T9).** Results show the total, Line + Angle + Transition, the first loss reason and the ruleset (`Assisted · keyboard-pedals · s-bend-2 · force-1 / precision-2`). A best is saved only for a finished, all-gates attempt with one input source and no `?debug`. It is keyed by physics, scoring, course, assistance and controls, so assisted and reduced-assistance results never share a best. Legacy Circuit and Free drift bests keep their original keys and are never written by force, reduced-assistance or controller runs. Malformed or non-finite records read as no best, and a failed write leaves the result on screen. Share falls back to download, then to a message, keeping Retry and Back to title.

## Defects found and fixed in this pass

| Defect | Effect | Fix and regression |
| --- | --- | --- |
| The challenge's first corner bent right, but the evaluator and cues expected a left slide | A natural drift missed every scored zone; synthetic fixtures had assumed the sign | Mirrored the course, revision `s-bend-2` (`ef98485`); bend-direction test and fingerprint-pinned revision |
| The transition eight was a Lissajous curve with 30-unit (3 m) hairpins | No car could follow the marking at slide speed | Two 300-unit loops crossing at (0, 900) (`c6de77a`); minimum-radius test |
| Transition's 6 s switch window started at the first half second of the left slide | A left slide held round the loop could time out before the crossing | The link stays armed while the left slide lasts; 4 s from its end to a held right slide |
| Finish attempt from pause showed "Clean link…" for an abandoned attempt | Misleading result | `endChallenge` settles the attempt: "Finish not reached. Retry from the start." (`edfae10`) |
| Reset after leaving a lesson returned to the lesson spawn | Free practice reset to the wrong place | Practice spawn on leaving (`8e10e70`) |
| `npm run lint` and `format:check` failed on local tool directories and four files | Required checks could not pass | Ignores and formatting (`a5cbf8a`) |

`precision-1` and `s-bend-1` records, including any saved by the deployed `74c3fc0` build, stay readable under their own keys and are never merged with `s-bend-2` results.

## Verification

- `npm run lint`, `npm run typecheck`, `npm test` (244 tests in 26 files), `npm run format:check` and `npm run build` all pass at the head of `feat/complete-drift-plan`.
- **Real-car fixtures.** `src/game/drift-fixture.ts` drives force handling exactly as a lot session does: 60 Hz, two 120 Hz substeps and grass beyond the slab, with no road following or corner lift. The scripted drivers feed the solver directly, as analogue input would, rather than through keyboard ramps.
- **Gate 3 determinism.** A recorded clean Assisted attempt ([inputs, events and total](evidence/2026-10-19-challenge-clean-drive.json): 884 frames, 3,727 points, all seven gates) replays twice to identical events that sum to the total.
- **Exploits.** Grip along the line, sliding wide of the gates and start-line doughnuts score 0. Excessive angle scores 1,490 with Assisted. Without countersteer the same angle spins, and the revoked corner leaves 0. Steering jitter earns no transition. Each run explains why.
- **Mutation check.** With the old challenge geometry restored, five of the eight real-car challenge tests fail.
- **Lessons with the real car.** Initiate and Sustain complete in both directions under Assisted and Reduced assistance, and Transition completes round the marked eight under both. Handbrake rotation on the spot, a right-first eight and a grip-only eight do not complete.
- **Feedback.** Grip use stays within 0–1, below 0.1 on a cruise and above 0.8 in a slide. Wheelspin appears only while drive exceeds rear grip, never while coasting, on the handbrake or with legacy handling.
- **Browser.** Checks, frame costs and bundle sizes are in [browser-checks.json](evidence/2026-10-19-plan-completion/browser-checks.json), with screenshots of the [new course](evidence/2026-10-19-plan-completion/desktop-challenge-s-bend-2.jpg) and [lesson eight](evidence/2026-10-19-plan-completion/desktop-transition-eight.jpg).

## Performance (T10)

- **Frame cost.** On a loaded desktop (Brave, Chrome/155, 1440 × 712 at DPR 2), force practice and legacy Free drift cost the same within each round: 0.3–2.1 ms mean update and 0.5–1.8 ms mean render. The Circuit measured 1.2–2.4 ms update in the same rounds, and occasional frames reached 17–25 ms while the machine was busy.
- **Solver.** The solver alone is 0.19 µs per step for legacy and 0.55 µs for force. Force handling adds no measurable frame cost.
- **Heap.** Used heap grew 0.23 MB over 20 s of practice.
- **Bundle.** The initial load is about 48 kB gzipped against the 150 kB budget. JavaScript grew from 18.6 to 29.3 kB gzipped since `dedc31f`.
- **Measuring again.** `?debug` now shows update and render cost and exposes `window.drifterTiming`, so the same measurement can be repeated on phones.

No phone, tablet or 60 fps device result exists yet. A loaded desktop is not a substitute.

## Decision: default handling (T11)

**Legacy stays the default for Circuit and Free drift.** Practice, lessons and the challenge keep force handling, and the force model stays selectable for timed runs in the development build. No moderated comparison, device run or human challenge attempt exists yet, so the plan's adoption evidence is absent. Nothing needs rolling back: timed rules, title drivers and legacy bests are unchanged, and challenge records are versioned. Revisit after the Gate 2 and Gate 3 sessions, using the human findings below.

## Gates

| Gate | Engineering evidence | Still pending |
| --- | --- | --- |
| 1 | Deterministic, mirrored and finite manoeuvres; grass transitions; unit and sign conversion (T2/T3). Practice past 60 s, reset, pause and exit without any best write (session test and browser). Scripted initiate-and-catch drives with the real car; browser keyboard drive through the Start gate | A person's keyboard walkthrough that initiates and catches a slide |
| 2 | Regression checks for every input and assistance profile; lessons completable with the real car under both profiles | Moderated sessions: repeat a slide, connect directions, explain a loss of control; numeric targets set after the baseline |
| 3 | Identical inputs give identical events; a clean link beats every exploit; results name the loss | Human attempts: does the result suggest a useful next try? Scoring-weight approval |
| 4 | Required checks pass; the default-handling decision is explicit | Human findings, physical touch hardware (reach, safe areas, audio unlock, frame rate) and controller hardware |

## Decision log

| Observation | Severity | Mechanism | Change | Ruleset | Test | Human follow-up |
| --- | --- | --- | --- | --- | --- | --- |
| First corner bent opposite to the credited slide | Blocking | Path sign | Mirrored course | `s-bend-2` | Bend direction; real-car drives | Confirm the hand matches the D3 schematic |
| Lesson eight undrivable | Blocking | Hairpin geometry | Two-loop eight | Lesson data | Minimum radius; real-car drives | Is 300 units the right loop size for new players? |
| Switch window lapsed during a held left slide | Major | Timer start | Armed until the slide ends; 4 s | Lesson data | Armed-switch and lapse tests | Calibrate 4 s with observed attempts |
| Assisted countersteer fades long slides | Unknown | Countersteer assist | None | — | Sustain holds 3.05 s at 0.35 rad under Assisted, completes under Reduced | Does Assisted make Sustain frustrating? |
| Clean scripted line is sensitive: 0.05 rad less slip or a 20–30 units/s top-speed change loses one or two gates | Unknown | Gate width and angle envelope | None | `precision-2` | Recorded in the drive probe | Is the challenge too demanding? Set targets before tuning |
| Wheelspin cue nearly inert: 21 of 600 frames in a held drift, peak 0.17 | Minor | Rear load transfer exceeds drive | None | `force-1` | Feedback tests | Does any engine cue help comprehension? |
| Results overview is a thin band on short windows | Minor | Opaque results panel | None | — | Screenshot | Design review against D3 results frames |

## Not done here

- Human baseline, moderated comparisons, physical touch devices, physical controllers and real share sheets.
- Figma: the cover lists D1 Practice, D2 Learning and assistance, and D3 Precision challenge pages, all proposed. They were built in a parallel design session and not re-reviewed here. The D3 course and D2 eight schematics should be checked against `s-bend-2` and the two-loop eight.
- The FigJam dependency diagram still needs a team selected in Figma.
- Release: merging to `main` deploys to GitHub Pages and needs the owner's go-ahead.
