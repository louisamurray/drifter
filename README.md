# Drifter

A simple car-drifting game for mobile browsers. Top-down, portrait, sixty-second runs. Steer with one thumb, or steer with one thumb and drive with the other, and chain drifts for score before the timer runs out. Drive the circuit, or free drift on an open lot with nothing to follow. Practise without a timer, take three short lessons, or try a two-corner precision challenge. Everything the car does is written onto the asphalt as rubber, and the game-over screen shows you the drawing you made.

Deployed to GitHub Pages on every push to `main`: https://louisamurray.github.io/drifter/

See [docs/PLAN.md](docs/PLAN.md) for the design and build plan, the [handling and engagement plan](docs/2026-10-19-drift-development-plan.md) for current work, the [roadmap](docs/2026-10-21-roadmap.md) for what comes next, and the [change note](docs/2026-10-19-change-note.md) for what changed most recently.

There is also a native iOS app under [`ios/`](ios/README.md): fully offline, two-thumb controls only, with a rigid-body car on Pacejka tyres in place of the arcade slide model. Open `ios/Drifter.xcodeproj` in Xcode 16 to build it.

## Playing

Two control schemes, chosen on the title screen and remembered. Both schemes also run on a keyboard for development.

**Two thumbs** (default). Controls sit in the bottom corners of the screen.

| Control   | Touch                                                | Keyboard         |
| --------- | ---------------------------------------------------- | ---------------- |
| Gas       | Hold the bottom-left pedal                           | Up or W          |
| Handbrake | Hold the pedal beside the gas                        | Space, Down or S |
| Steer     | Point the bottom-right stick where the car should go | Arrows or A/D    |
| Pause     | Button under the timer                               | Escape or P      |

Nothing moves the car but the gas. The stick is directional: its angle is the heading you want in screen space, and the car steers towards it.

**One thumb.** The car accelerates by itself and lifts off for corners it is going too fast for.

| Control   | Touch                                     | Keyboard         |
| --------- | ----------------------------------------- | ---------------- |
| Steer     | Hold the left or right half of the screen | Arrows or A/D    |
| Handbrake | Hold both halves                          | Space, Down or S |
| Pause     | Button under the timer                    | Escape or P      |

**Modes.** The circuit is a closed loop with laps and a lap bonus. Free drift is an open lot: no road to follow, so only the thumbs steer the car, and leaving the asphalt ends a chain. Each mode keeps its own best score, and the title screen lists both. Both timed modes use the original arcade handling.

**Practice, lessons and the challenge.** These run on the open lot with the force-based car: front and rear tyres, weight transfer and a locking handbrake.

- **Practice** has no timer or score. **R** or the Reset button starts again at once, and End practice (from pause) shows your rubber.
- **Optional lessons** are inside Practice. Initiate starts a slide and holds it for half a second. Sustain holds one slide for four seconds. Transition slides left round the first loop of a marked eight, then switches and slides right.
- **Challenge** is two linked corners: cross the gates in order, sliding left then right. It is scored on line, angle and transition, and results name your first mistake. Challenge bests are kept separately for each handling, scoring, course, assistance and controls combination.

**Assistance.** Assisted helps catch slides with automatic countersteer; on the circuit it also follows the road and, with one thumb, lifts for corners. Reduced assistance turns those aids off. Neither changes one-thumb auto-throttle. Runs with Reduced assistance, the force-based car or a controller never replace Circuit or Free drift bests.

**Controller.** A standard controller works: left stick steers, RT is gas, A or LT is the handbrake, Start drives or resumes, B pauses and Y resets. Disconnecting it mid-run pauses the game.

On a phone in a browser, the title screen suggests Add to Home Screen. Launched that way there is no browser toolbar under the thumb.

On desktop, press **Enter** to start, retry or resume. **Esc/P** toggles pause, and **R** resets in practice, lessons and the challenge. Keyboard hints replace the touch joystick and pedals on devices with a mouse or trackpad. The selected control scheme still determines whether acceleration is automatic or uses **W/Up**.

## Development

Requires Node 22+.

```sh
npm install
npm run dev        # dev server, reachable from a phone on the same network
npm run build      # typecheck + production bundle in dist/
npm run preview    # serve the production bundle
```

Before committing:

```sh
npm run lint
npm run typecheck
npm test
npm run format:check
```

### Tuning on a phone

Load the game with `?debug` for an on-device tuning panel. Every numeric tunable in the physics, camera and steering groups becomes a slider that changes the live config, plus an autopilot toggle and an aggression slider so balance can be watched without thumbs. A readout shows speed, slip, laps, FPS, input, which audio and haptics paths are in use, and the mean and 95th-percentile cost of each update and render callback. The same timings are available as `window.drifterTiming.stats('update')` and `stats('render')`. With `npm run dev`, the panel can also switch timed runs to the force-based car.

### Tests

Vitest, with tests beside the modules they cover. Beyond unit tests for physics, scoring, input, laps and track maths, drivers run the whole game in the suite:

- A cautious autopilot with a handbrake must lap the circuit.
- A naive thumb with human reaction time drives through the real input path on a portrait and a landscape phone, and must stay mostly on the road while still drifting enough.
- A figure-of-eight pilot must stay on the asphalt of the free drift lot.
- Scripted drivers take the force-based car through each lesson and the challenge, under both assistance profiles. A recorded clean challenge drive (`docs/evidence/2026-10-19-challenge-clean-drive.json`) must replay to identical score events, and exploit drives must score far less.

Tune against these, not against how a change feels.

## Project layout

```
src/
  main.ts      bootstrap, run state, the update and render functions
  config.ts    every tunable, palette included
  core/        loop, input, canvas, haptics, state and mode types
  game/        car physics, track, lot, laps, scoring, particles, test drivers
  render/      camera, canvas drawing, skid layer, DOM HUD
  audio/       Web Audio engine, telemetry mappings, iOS playback session
  debug/       the ?debug tuning panel
  storage.ts   best scores and remembered settings in localStorage
public/        web manifest and icons
ios/           the native iOS app (Swift, SpriteKit, SwiftUI); see ios/README.md
```

## Stack

TypeScript, Vite, Canvas 2D, no framework. ESLint and Prettier for hygiene, Vitest for unit tests. The HUD is DOM; the game is canvas. The UI font is Archivo Expanded (SIL Open Font License), bundled under `src/assets/fonts/`.
