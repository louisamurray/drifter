# Drifter — Game Design & Build Plan

A simple, satisfying car-drifting game for mobile browsers. Top-down, one-thumb controls, short sessions, instant restart.

---

## 1. Vision

**One-line pitch:** Hold to throttle, tilt your thumb to steer, chain drifts around a looping track for score before the timer runs out.

**Design pillars**

1. **Feels good in 5 seconds.** The car must feel slidey and controllable on the very first touch. Everything else is secondary.
2. **One thumb, portrait.** Playable on a bus with one hand. No virtual joysticks with eight buttons.
3. **Short loop, high replay.** 60-second runs, score multiplier for chained drifts, local high score. Restart in one tap.
4. **Zero friction.** Loads in under 2 seconds on 4G, no login, no install, works offline after first load (PWA).

**Non-goals (v1):** multiplayer, car customisation, realistic physics, 3D, monetisation, accounts.

---

## 2. Core Gameplay

### 2.1 Camera & view
- Top-down 2D, camera follows the car with slight lead in the direction of travel and a gentle zoom-out at high speed.
- Portrait orientation locked by layout (landscape shows a "rotate your phone" overlay).
- Track is a closed loop with a mix of hairpins, sweepers and a long straight, about 3 to 4 screen-heights per lap.

### 2.2 Controls (mobile first)
| Input | Action |
|---|---|
| Touch anywhere | Throttle on (car accelerates while held) |
| Drag left / right from touch origin | Steer, proportional to horizontal drag distance (dead zone 8px, full lock at 60px) |
| Release | Throttle off, coast, steering returns to centre |
| Two-finger tap | Pause |

Desktop fallback for development and testing: arrow keys or WASD, Space for handbrake-style kick (not exposed on mobile in v1).

Rationale: the drag-to-steer model keeps the thumb in one place, works for left or right handed players, and gives analogue steering without a visible joystick.

### 2.3 Car physics (arcade, not simulation)
Simple velocity-based model, tuned by feel:
- State: position, heading, velocity vector, angular velocity.
- Each frame, split velocity into **forward** (along heading) and **lateral** (sideways) components.
- Apply **lateral grip** by damping the lateral component. Low damping = drift. Grip drops as steering angle and speed increase, which is what makes the car "break loose" in corners.
- Forward drag and max speed cap. Reverse not needed.
- Steering authority scales with speed (no steering when stationary, reduced at very high speed).
- **Drift state** = lateral speed above a threshold AND forward speed above a minimum. Entering drift slightly boosts angular response so holding the slide feels intentional.

Tunables live in one config object so tuning is a one-file job: `maxSpeed`, `accel`, `drag`, `gripNormal`, `gripDrift`, `steerRate`, `driftThreshold`.

### 2.4 Track & collisions
- Track defined as a polyline centreline plus width. Rendered as asphalt on grass with painted edges.
- Off-track detection by distance from centreline. Off-track = heavy drag and grip penalty, no hard walls (hard walls on mobile feel punishing). Drift chain breaks when off-track.
- Optional soft barriers (tyre stacks) on the outside of the two hardest corners as visual guides, pushing the car back gently.

### 2.5 Scoring
- Points accrue each frame while drifting: `points += driftAngle × speed × dt × multiplier`.
- **Multiplier** rises by 0.5 every 2 seconds of continuous drift, capped at ×5. Resets to ×1 after 1 second with no drift or when off-track.
- A drift "chain" banks when it ends. Chain score pops up with a short animation. Lap completion adds a flat bonus.
- Run ends when a 60-second timer hits zero. Final score compared against local best.

### 2.6 Game loop & screens
1. **Title** — logo, "Tap to drive", best score, sound toggle.
2. **Countdown** — 3-2-1 overlaid on the track, car static.
3. **Playing** — HUD: timer (top centre), score (top left), multiplier badge (top right, pulses when it increases), current chain score floating near the car.
4. **Game over** — final score, best score, "new best" callout, Restart button (large, bottom), Share button (Web Share API with score text).
5. **Pause** — resume / restart / sound.

---

## 3. Look & Feel

- **Style:** flat, bold colours, minimal detail so it reads at phone size. Dusk palette (deep blue asphalt, orange horizon tint, cream track markings).
- **Juice (cheap, high impact):**
  - Tyre skid marks persist on the track while drifting (drawn to an offscreen canvas, faded slowly).
  - Smoke particles from rear wheels, intensity scales with drift angle.
  - Subtle screen shake on chain bank, scaled by chain size.
  - Haptic tick (`navigator.vibrate`) on multiplier increase and chain bank, where supported.
- **Audio:** one engine loop pitched by speed, tyre squeal loop gained by drift angle, three short SFX (chain bank, multiplier up, countdown). Web Audio API, unlocked on first touch. Muted by default until the player taps the sound toggle or starts a run (iOS autoplay rules).

---

## 4. Technical Plan

### 4.1 Stack
| Concern | Choice | Why |
|---|---|---|
| Language | TypeScript | Types keep physics and state code honest; cheap to add |
| Rendering | HTML5 Canvas 2D | Enough for top-down 2D, no WebGL complexity, excellent mobile support |
| Build | Vite | Fast dev server, tiny production bundle, PWA plugin available |
| Framework | None (vanilla) | A game loop and a few screens do not need React; keeps bundle under 50 KB |
| Lint / format | ESLint + Prettier | Required by commit hygiene rules |
| Tests | Vitest | Unit tests for physics, scoring, track distance maths |
| PWA | vite-plugin-pwa | Offline play, add-to-home-screen |
| Hosting | GitHub Pages (static) | Zero cost, fits a static bundle |

### 4.2 Architecture
```
src/
  main.ts            bootstrap, resize handling, starts the loop
  config.ts          all tunables in one place
  core/
    loop.ts          fixed-timestep update (60 Hz) + variable render, rAF driven
    input.ts         touch/pointer/keyboard -> { throttle: 0..1, steer: -1..1 }
    state.ts         finite state machine: title | countdown | playing | paused | gameover
  game/
    car.ts           physics step, drift detection
    track.ts         track definition, distance-to-centreline, lap detection
    scoring.ts       chain, multiplier, timer
    particles.ts     smoke, skid marks
  render/
    camera.ts        follow, lead, zoom
    draw.ts          track, car, particles, skids
    hud.ts           DOM overlay for text (crisper than canvas text, trivially styled)
  audio/
    audio.ts         Web Audio graph, engine/squeal loops, SFX
  storage.ts         localStorage best score, settings
```

Key decisions:
- **Fixed timestep physics** (16.67 ms, with accumulator) so the car behaves identically on 60 Hz and 120 Hz screens.
- **HUD in DOM**, game in canvas. Text rendering and buttons are far easier and more accessible in HTML.
- **Device pixel ratio aware canvas**, capped at 2× to protect frame rate on high-DPR phones.
- **Pointer Events** for input, with `touch-action: none` on the canvas to stop scroll and pinch-zoom.
- **Visibility API** pauses the game when the tab is backgrounded.

### 4.3 Performance budget
- 60 fps on a mid-range Android phone from ~2022 (e.g. Pixel 6a class) and iPhone 11.
- Initial load under 150 KB gzipped including audio.
- No per-frame allocations in the physics step; particle pool pre-allocated.
- Skid marks rendered to a persistent offscreen canvas rather than re-drawn each frame.

### 4.4 Mobile-specific checklist
- `viewport-fit=cover`, safe-area insets for HUD on notched phones.
- Prevent double-tap zoom, pull-to-refresh, long-press callout, text selection.
- Handle `resize` and `orientationchange` by re-fitting the canvas.
- Audio context resume on first user gesture.
- Test iOS Safari (most restrictive) first, then Chrome Android.

---

## 5. Milestones

Each milestone ends in something playable. Commits are small and follow `type(scope): summary`.

| # | Milestone | Scope | Done when |
|---|---|---|---|
| 0 | **Scaffold** | Vite + TS + ESLint + Prettier + Vitest, canvas fills screen, blank loop running | `npm run dev` shows a coloured canvas at 60 fps on a phone |
| 1 | **Car moves** | Input module, car physics, camera follow, debug rectangle for the car | Car can be driven around an empty field with one thumb and it drifts |
| 2 | **Track** | Track data, rendering, off-track detection, lap detection | Can drive laps, going off-track feels bad |
| 3 | **Scoring loop** | Drift detection, chain, multiplier, timer, HUD, title and game-over screens, best score | A complete 60-second run with a score can be played and restarted |
| 4 | **Juice** | Skid marks, smoke, screen shake, haptics, car sprite, palette pass | Game looks and feels like a game, not a prototype |
| 5 | **Audio** | Engine, squeal, SFX, mute toggle, iOS unlock | Sound works on iPhone and Android with headphones |
| 6 | **Ship** | PWA manifest and service worker, GitHub Pages deploy workflow, README, device test pass | Installable from a public URL, plays offline |

Suggested branches: `build/scaffold`, `feat/car-physics`, `feat/track`, `feat/scoring-loop`, `feat/juice`, `feat/audio`, `build/pwa-deploy`.

---

## 6. Testing

- **Unit (Vitest):** physics step determinism, drift threshold edge cases, multiplier timing, distance-to-polyline, lap counter does not double-count.
- **Manual device matrix:** iPhone (Safari), mid-range Android (Chrome), one tablet. Check input, audio unlock, safe areas, frame rate via a debug FPS toggle.
- **Tuning sessions:** a hidden debug panel (query string `?debug`) exposes the physics tunables as sliders so feel can be adjusted on a real phone without rebuilding.

---

## 7. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Car feel is wrong and the whole game falls flat | Milestone 1 is entirely about feel; do not proceed until it is fun to just slide around |
| Drag-to-steer is unintuitive for some players | Title screen shows a 2-second animated hint; keep a left/right split-screen tap mode behind a setting as a fallback |
| iOS audio quirks | Audio is a separate late milestone; game is fully playable muted |
| Frame drops on low-end phones | DPR cap, particle pool limits, skid marks on offscreen canvas, fixed timestep so physics stays correct even when rendering drops frames |
| Scope creep (garage, more tracks, multiplayer) | Non-goals listed above; anything new goes in a `docs/BACKLOG.md`, not the current milestone |

---

## 8. Later Ideas (backlog, not v1)

- Multiple tracks unlocked by score thresholds
- Ghost replay of best run
- Daily seed track for shared leaderboards
- Car colour picker
- Gamepad support
