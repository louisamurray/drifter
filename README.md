# Drifter

A simple car-drifting game for mobile browsers. Top-down, portrait, sixty-second runs. Steer with one thumb, or steer with one thumb and drive with the other, and chain drifts for score before the timer runs out. Drive the circuit, or free drift on an open lot with nothing to follow. Everything the car does is written onto the asphalt as rubber, and the game-over screen shows you the drawing you made.

Deployed to GitHub Pages on every push to `main`: https://louisamurray.github.io/drifter/

See [docs/PLAN.md](docs/PLAN.md) for the design and build plan.

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

**Modes.** The circuit is a closed loop with laps and a lap bonus. Free drift is an open lot: no road to follow, so only the thumbs steer the car, and leaving the asphalt ends a chain. Each mode keeps its own best score, and the title screen lists both.

On a phone in a browser, the title screen suggests Add to Home Screen. Launched that way there is no browser toolbar under the thumb.

On desktop, press **Enter** to start, retry or resume. **Esc/P** toggles pause. Keyboard hints replace the touch joystick and pedals on devices with a mouse or trackpad. The selected control scheme still determines whether acceleration is automatic or uses **W/Up**.

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

Load the game with `?debug` for an on-device tuning panel. Every numeric tunable in the physics, camera and steering groups becomes a slider that changes the live config, plus an autopilot toggle and an aggression slider so balance can be watched without thumbs. A readout shows speed, slip, laps, FPS, input, and which audio and haptics paths are in use.

### Tests

Vitest, with tests beside the modules they cover. Beyond unit tests for physics, scoring, input, laps and track maths, two drivers run the whole game in the suite:

- A cautious autopilot with a handbrake must lap the circuit.
- A naive thumb with human reaction time drives through the real input path on a portrait and a landscape phone, and must stay mostly on the road while still drifting enough.
- A figure-of-eight pilot must stay on the asphalt of the free drift lot.

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
