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
Two schemes, chosen on the title screen and remembered. **Two thumbs** is the default: visible controls in the bottom corners, the left thumb drives and the right thumb steers. Touches above the bottom 45% of the screen are not controls, so the pause button and the HUD are safe.

| Control | Action |
|---|---|
| Gas (bottom-left corner) | Nothing else moves the car: lift to coast, hold to go. The gas eases in over 0.15 s and lets go at once. There is no corner lift in this scheme, speed is the player's to choose, and the tail lights glow whenever the gas is off |
| Handbrake (beside the gas) | Grip drops, speed scrubs, rear steps out. Works with the gas held |
| Stick (bottom-right corner) | A fixed base with a knob. The stick is directional only: its angle from the centre is the heading the player wants, in screen space (the camera never rotates, so up is up), and the car steers towards it, proportionally to the error and at full lock from about 35° off. Pointing it behind the car turns the car round. How far the thumb is from the centre does not matter beyond a small deadzone, and it never touches the throttle. The steer is applied directly rather than through the two-stage ramp. Touch hits anywhere in the bottom-right quarter grab it, so the thumb need not land on the base |

The drag-to-steer objection below does not apply here: the stick's centre is drawn on screen, and throttle lives on the other thumb.

**One thumb** keeps the original scheme, with automatic throttle and the corner lift:

| Input | Action |
|---|---|
| Hold left half of screen | Steer left. Two stages: half lock within 0.3 s (a grip turn), full lock after a further 0.5 s (the drift). Tap to correct, hold to commit |
| Hold right half of screen | Steer right, same two stages |
| Hold both | Handbrake: grip drops, speed scrubs, rear steps out. Steer stays with the side pressed first |
| No touch | Straighten. On asphalt the car also eases its nose toward the road direction (road assist), weaker mid-slide, off on grass. The car accelerates by itself at all times, but lifts off when it is going faster than the road ahead can take (corner lift) |
| Pause button under the timer | Pause |

Desktop fallback for development and testing: arrow keys or A/D steer, Up or W is the gas (two thumbs only), Space or Down is the handbrake, Escape or P pauses.

Rationale: the physics decides the slide angle, so the player's only decisions are when to start sliding and when to stop. Binary hold controls make those decisions legible through the thumb, need no invisible centre point, and work one-handed (alternate sides) or two-handed (one thumb per side, handbrake by adding the second). An earlier drag-to-steer scheme was built and rejected: its centre was wherever the thumb first landed, steer and throttle were welded together, and full lock arrived within a few millimetres of travel.

### 2.3 Car physics (arcade, not simulation)
Simple velocity-based model, tuned by feel:
- State: position, heading, velocity vector, angular velocity.
- Each frame, split velocity into **forward** (along heading) and **lateral** (sideways) components.
- Apply **lateral grip** by damping the lateral component. Low damping = drift. Grip drops as steering angle and speed increase, which is what makes the car "break loose" in corners.
- Forward drag and max speed cap. Reverse not needed.
- Steering authority scales with speed (no steering when stationary, reduced at very high speed).
- **Drift state** = lateral speed above a threshold AND forward speed above a minimum. Entering drift slightly boosts angular response so holding the slide feels intentional.
- **Long holds slow the car.** In the second steering stage throttle is cut by up to half, so a committed slide tightens and sheds speed. This is what makes every corner makeable without the handbrake.
- **Road assist.** With no side held and the car on asphalt, yaw eases toward the road tangent (gain-limited). Half strength while drifting, zero on grass, and off while a thumb is on the stick, which then owns the heading. It is the thing that makes releasing the thumb safe.
- **Corner lift.** The automatic throttle eases off when the car is faster than the tightest corner within about a second of travel can take, with a little extra drag while lifted. Corner speed is `sqrt(cornerAccel × radius)`, so the hairpin is entered at roughly half of top speed and the straight is still flat out. The player never brakes for a corner; they decide when to slide, which the lift does not prevent. This is what makes a 200 to 250 ms thumb able to stay on the road.
- **Tuned against drivers, not feelings.** Two drivers run in the test suite. A cautious autopilot with a handbrake must lap the circuit (it feeds the physics directly, so it checks the track, not the controls). A naive thumb (200 to 250 ms reaction, re-decides ten times a second, looks somewhere in the visible road but no further than the next apex, leads its own lag by judging where the nose will be pointing a reaction time ahead, holds a side when the nose is off the spot, never brakes) drives through the real input path: held side, steering ramp, road assist, corner lift, then the physics. It is run for a portrait and a landscape phone, since landscape shows less than a second of road ahead at top speed. The bar is under 15% of the run off the road, at least two laps, and at least 10% of the run drifting so the car cannot be made safe by making it dull. Without the corner lift the thumb spends about half of every run on the grass; with it the worst profile is on the grass about an eighth of the time.

Tunables live in one config object so tuning is a one-file job: `maxSpeed`, `accel`, `drag`, `gripNormal`, `gripDrift`, `steerRate`, `driftThreshold`, `cornerAccel`.

### 2.4 Track & collisions
- Track defined as a polyline centreline plus width. Rendered as asphalt on grass with painted edges.
- No centreline radius tighter than about 95 world units against a 65 half-width. The first circuit had a 44-radius S apex and a 76-radius hairpin, which no auto-throttle car could take, and was redrawn.
- Off-track detection by distance from centreline. Off-track = heavy drag and grip penalty, no hard walls (hard walls on mobile feel punishing). Drift chain breaks when off-track.
- Rumble strips on the outside of the two hardest corners as the only visual guide (see section 3.6). No barriers or props.

### 2.5 Scoring
- Points accrue each frame while drifting: `points += driftAngle × speed × dt × multiplier`.
- **Multiplier** rises by 0.5 every 2 seconds of continuous drift, capped at ×5. Resets to ×1 after 1 second with no drift or when off-track.
- **Running wide** ends the chain: half of it banks, the other half is lost along with the multiplier. Harsh enough to matter, not so harsh that one clipped kerb erases a run.
- **Handbrake** drifts score at 35% rate. It starts chains and sets up corners, it is not a free points button.
- A drift "chain" banks when it ends. Chain score pops up with a short animation. Lap completion adds a flat bonus.
- Run ends when a 60-second timer hits zero. Final score compared against local best.

### 2.6 Game loop & screens
1. **Title** — ghost car laps the empty track with a thumb-drag hint (see section 3.8), "Tap to drive", best score, sound toggle, and a mode toggle: circuit or free drift (see section 2.7). A controls toggle above the hint picks one thumb or two.
2. **Countdown** — 3-2-1 overlaid on the track, car static.
3. **Playing** — HUD: timer (top centre), score (top left), multiplier badge (top right, pulses when it increases), current chain score floating near the car.
4. **Game over** — camera zooms out to show the whole track with the player's rubber on it, then final score, best score, "new best" callout, Restart button (large, bottom), Share button (Web Share API sending the zoomed-out frame as an image plus score text).
5. **Pause** — resume / restart / sound. Reached from the small button under the timer.

### 2.7 Free drift (open lot)
A second course, chosen on the title screen and remembered: a rounded slab of asphalt 1800 by 2600 world units (about five screens tall), grass beyond its edge, faint parking bays painted along the long edges for scale and motion, and a faint painted ring in the middle to slide around. The rubber canvas caps its pixel count and lowers its resolution for a course this large rather than its frame rate. There is nothing to follow, so there is no road assist, no corner lift and no laps; only the thumbs steer the car. The 60-second run, chain, multiplier and scoring are unchanged, and leaving the slab ends a chain exactly as running wide does on the circuit. Each mode keeps its own best score. The title ghost on the lot chases a point round a figure of eight, pulling the handbrake through the direction changes, so the screen shows what the mode is for; a test keeps it on the asphalt and sliding for most of its run. The rubber canvas and the game-over overview are sized from the course's bounds, so the share frame is the whole slab with the run drawn on it.

---

## 3. Visual Direction

### 3.1 Concept: the track is the canvas
Everything the player does is written onto the asphalt as rubber. The car is small and quiet; the skid marks are the hero. By the end of a 60-second run the track should look like a drawing the player made, and the game-over screen shows it to them. The persistent skid canvas (a performance choice in section 4) is also the art direction, which gives the game a distinctive look and a sharable moment for free.

### 3.2 Principles
1. **Quiet world, loud rubber.** Track, grass and car sit in low-saturation tones. Skid marks, smoke and score pops are the only high-contrast elements during play.
2. **Nothing precious under the thumb.** In portrait with drag-to-steer, the thumb and forearm cover roughly the bottom third of the screen. The car sits at about 60% of screen height, the HUD lives in the top safe area, and no information is ever placed low during play.
3. **Read it at a glance or don't show it.** The player watches the car, not the screen corners. Every HUD element must work in peripheral vision: large, few, high contrast, and changing shape or motion (not just number) when something matters.

### 3.3 Palette (roles, not moods)
Values are starting points and live in `config.ts` alongside the physics tunables so they can be adjusted on-device through the debug panel.

| Role | Value | Notes |
|---|---|---|
| Asphalt | `#1C2230` | Cool near-black with a hint of blue. Not pure black, so rubber still reads on it |
| Track edge line | `#E8DCC4` | Warm cream. The only painted detail on the track |
| Off-track surface | muted olive, e.g. `#4A5238` | Deliberately dull so the eye is not pulled off the road. Textured with mown stripes and specks a few percent off the base, so running wide still shows motion |
| Skid marks | warm black at 70% alpha | Builds up with repeated passes |
| Accent | `#FF5A2D` | Hot orange-red. Multiplier badge, chain score pops, smoke tint at high drift angle. **Never decorative.** If it appears anywhere else it has stopped working |
| HUD text | `#F2EEE6` | Off-white |

Check cream-on-asphalt and accent-on-asphalt at 4.5:1 or better before committing. Verify the olive reads correctly on a dim OLED.

### 3.4 Typography
One family: a wide or extended grotesk with a heavy weight and **tabular figures**, so the timer does not jitter as digits change. Score and timer at a minimum of 28px rendered; multiplier badge larger. The chain score floating near the car is the most important text in the game: the largest element, scaling with chain size, with a short pop-and-settle rather than a fade.

### 3.5 HUD layout (portrait)
- Timer top centre, score top left, multiplier top right. All inside the safe area.
- A very light scrim behind HUD text only if the track shows through too noisily.
- The multiplier badge changes **shape**, not just number: a ring fills over the 2 seconds before the next step so the player feels the next tier coming without reading. When the chain breaks, the ring empties with a hard snap, no fade.
- Chain score pops at the car, not in the HUD.
- A 3px bar under the status bar drains with the clock and turns accent for the last ten seconds, when each whole second also snaps the timer. Time left reads in peripheral vision without reading digits.
- Off the road the screen edges darken. The vignette is a DOM layer the compositor fades, not a canvas gradient: shading one every frame cost a third of the frame budget on a software rasteriser.

### 3.6 Car and track
- Car is roughly 36 to 44px long at phone scale. A detailed sprite becomes mud at that size. Use a two-tone silhouette with a lighter roof so heading is unambiguous, and rear wheels drawn slightly wider so smoke and rubber visibly come from them. The silhouette tapers to the nose, with dark glass either side of the roof, front wheels that turn with the steer input, a rear wing, and tail lights that glow on the handbrake or a corner lift. In a slide the body shifts a pixel or two on its wheels for a hint of roll.
- A soft shadow outside the edge line and a drop shadow under the car lift them off the grass. Chain text and score pops carry a dark halo so they read over cream and olive alike.
- Track has one strong, consistent edge line. Rumble strips appear only on the two hardest corners, which doubles as the hint for where the best drifts are.
- No tyre-stack barriers or roadside props. They add detail exactly where the player should be watching the car.

### 3.7 The four moments to design properly
In priority order:
1. **First drift.** Rubber appears, squeal starts, small haptic tick. Nothing else. Haptics are Android only: iOS exposes no vibration API to web pages, and the iOS 18 switch-toggle tick only fires inside a touch handler, which in-game events never are.
2. **Multiplier step-up.** Ring completes, badge punches up one size, accent flash on the badge only.
3. **Chain bank.** Score pop at the car, short screen shake scaled by chain size. The rubber on the track is already the record.
4. **Game over.** Camera zooms out to show the whole track with the player's rubber on it, then score and buttons overlay. This frame is the share image: the Web Share API sends the image, not just text.

### 3.8 Title screen
No logo over a static scene. Show the empty track with a ghost car doing one slow lap, laying rubber, with a thumb-shaped hint dragging left and right in time with the steering. Two seconds of that teaches the control better than text. Below it: "Tap to drive" and the best score. Nothing else. The logo carries a one-line tagline, and the foot sits over a bottom scrim so it reads wherever the ghost car is.

### 3.9 Audio
One engine loop pitched by speed, a tyre squeal loop gained by drift angle, and three short SFX (chain bank, multiplier up, countdown). Web Audio API, unlocked on first touch. Muted by default until the player taps the sound toggle or starts a run (iOS autoplay rules).

### 3.10 Tone and device checks
- **Tone (decided):** cold and precise, time-attack. Restrained palette, single hot accent, hard snaps over soft fades, no toy-like chunkiness. Every later visual choice is tested against this.
- Cannot be judged from a screenshot: legibility in sunlight, the olive on a dim OLED, and whether 36px is too small on a 6.7-inch phone at arm's length. Check on two real phones outdoors during milestone 4.

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
    mode.ts          which course a run is on: track | free
  game/
    car.ts           physics step, drift detection
    track.ts         track definition, distance-to-centreline, lap detection
    lot.ts           open lot geometry and its figure-eight title ghost
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
- Grass is a tiled canvas pattern filled over the visible world each frame: one draw call on GPU raster, and the cheapest texture that still moves.

### 4.4 Mobile-specific checklist
- `viewport-fit=cover`, safe-area insets for HUD on notched phones.
- Prevent double-tap zoom, pull-to-refresh, long-press callout, text selection.
- Handle `resize` and `orientationchange` by re-fitting the canvas.
- Audio context resume on first user gesture.
- The ringer-switch workaround must not create a media element where the Audio Session API exists (iOS 17+). Brave on iOS offers to add any media element to its Playlist on a long press, which is the game's only gesture. The debug readout shows which path is in use.
- Test iOS Safari (most restrictive) first, then Chrome Android.
- Browser toolbars sit at the bottom of an iPhone screen (Safari, Brave), under a portrait thumb. A long press there opens the browser's own menus and the page never sees it. Mitigations: hold cues sit mid-screen and stay until the first lap, and in a browser on a touch device the title screen suggests Add to Home Screen, which launches with no toolbar. A web manifest and icons ship for that; the service worker is still milestone 6.

---

## 5. Milestones

Each milestone ends in something playable. Commits are small and follow `type(scope): summary`.

| # | Milestone | Scope | Done when |
|---|---|---|---|
| 0 | **Scaffold** | Vite + TS + ESLint + Prettier + Vitest, canvas fills screen, blank loop running | `npm run dev` shows a coloured canvas at 60 fps on a phone |
| 1 | **Car moves** | Input module, car physics, camera follow, debug rectangle for the car | Car can be driven around an empty field with one thumb and it drifts |
| 2 | **Track** | Track data, rendering, off-track detection, lap detection | Can drive laps, going off-track feels bad |
| 3 | **Scoring loop** | Drift detection, chain, multiplier, timer, HUD, title and game-over screens, best score | A complete 60-second run with a score can be played and restarted |
| 4 | **Juice** | Skid marks, smoke, screen shake, haptics, car silhouette, palette and type pass, multiplier ring, game-over zoom-out, outdoor device check | Game looks and feels like a game, not a prototype |
| 5 | **Audio** | Engine, squeal, SFX, mute toggle, iOS unlock | Sound works on iPhone and Android with headphones |
| 6 | **Ship** | PWA manifest and service worker, GitHub Pages deploy workflow, README, device test pass | Installable from a public URL, plays offline |

Suggested branches: `build/scaffold`, `feat/car-physics`, `feat/track`, `feat/scoring-loop`, `feat/juice`, `feat/audio`, `build/pwa-deploy`.

---

## 6. Testing

- **Unit (Vitest):** physics step determinism, drift threshold edge cases, multiplier timing, distance-to-polyline, lap counter does not double-count.
- **Drivability (Vitest):** the autopilot and naive thumb runs in section 2.3. Tune against the thumb's off-track time, not against how a change feels to the person who made it.
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
