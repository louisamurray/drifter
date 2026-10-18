# Drifter: drift physics and engagement research

Research date: 19 October 2026  
Question type: comparative research and prioritised recommendations  
Scope: desktop/web handling and engagement, with the native iOS implementation as a reference.

## Recommendation

Develop more believable car handling alongside challenges that reward controlling it. Players should learn to initiate a slide, balance it with throttle and countersteer, then connect it cleanly into the next corner.

The first development slice should be a force-based web car plus an untimed practice lot. Establish the handling before building progression around it.

This investigation inspected the repository and public sources. It did not change gameplay code, validate the physics against a real car, or establish engagement improvements through human playtesting. Engagement recommendations are hypotheses to test.

## Evidence from the current implementation

The web and iOS versions have substantially different physics.

| Area | Desktop/web now | iOS now |
| --- | --- | --- |
| Steering | Requests a rotation rate | Creates forces through front tyre steering |
| Grip | Lateral velocity damping | Separate front/rear tyre force curves |
| Throttle during drift | Changes grip and adds an acceleration boost | Uses some of the rear tyres' available traction |
| Weight transfer | Absent | Simplified front/rear load transfer |
| Handbrake | Reduces overall lateral grip | Models a locked rear axle |

Repository evidence:

- [Web physics](../src/game/car.ts): drift detection changes grip, acceleration and yaw response; steering asks for a yaw rate.
- [Web configuration](../src/config.ts): contains grip, yaw and drift boosts, steering ramps and assistance settings.
- [Web controls](../src/core/input.ts): keyboard steering uses a two-stage ramp; manual throttle demand is binary before smoothing.
- [Web scoring](../src/game/scoring.ts): points accrue from absolute slip angle, speed, duration and multiplier, with a handbrake discount.
- [Web audio mapping](../src/audio/mapping.ts): engine frequency is primarily derived from vehicle speed, with drift and handbrake modifiers.
- [Native physics](../ios/Drifter/Game/Vehicle.swift): implements a two-axle rigid-body model, tyre force curves, longitudinal load transfer, combined traction limits and countersteer assistance.
- [Native vehicle tests](../ios/DrifterTests/VehicleTests.swift): contain acceleration, stable-turn, power-over drift, handbrake and surface scenarios. Their existence does not establish real-car fidelity or human enjoyment.
- [Original plan](PLAN.md): explicitly treated realistic physics as a v1 non-goal. The request for more realistic drifting changes that product direction.

### Inference

Changing web grip constants alone will have limited results. The current structure makes drifting partly a switched behaviour. A force-based model offers a more continuous relationship between steering, throttle, traction and rotation.

The iOS implementation is a useful starting point. Its tyre parameters and assists do not establish real-car accuracy. It also lacks explicit wheel angular-speed dynamics, so its wheelspin signal is an approximation rather than a full drivetrain simulation.

## Sourced findings

### Vehicle dynamics

Stanford's drifting research describes sustained drifting in terms of rear tyre saturation, large sideslip, countersteering and rear wheelspin. It explains that rear drive force has lateral control authority because longitudinal and lateral tyre forces are coupled at saturation.

Source: [Dynamics and Control of Drifting in Automobiles, Rami Hindiyeh, Stanford, March 2013](https://ddl.stanford.edu/publications/thesis/dynamics-and-control-drifting-automobiles).

NVIDIA's vehicle simulation documentation provides an implementation reference for deriving vehicle motion from tyre and suspension forces applied to a rigid body. This is supporting technical context; it is not a recommendation to add PhysX to this small 2D game.

Source: [PhysX SDK vehicle documentation, version 5.6.1](https://nvidia-omniverse.github.io/PhysX/physx/5.6.1/docs/Vehicles.html).

### Scoring and engagement precedents

Formula DRIFT evaluates line, angle and style. Its 2026 competition-format announcement describes automated measurement of line and angle, with style assessed by judges. These dimensions provide inspiration for rewarding precision beyond time spent sideways.

Source: [Formula DRIFT announces major 2026 competition format changes, 23 February 2026](https://news.formulad.com/2026/fd-news/formula-drift-announces-major-2026-competition-format-changes-in-partnership-with-race-data-labs/).

Absolute Drift's published feature description includes free-roam practice, drift-line challenges, tutorials, replays and ghost cars. These are relevant genre precedents, not evidence that the same additions will improve Drifter's retention.

Source: [Absolute Drift, developer/publisher description on Steam](https://store.steampowered.com/app/320140/Absolute_Drift/), checked 19 October 2026.

## Recommended handling changes

1. **Model front and rear axles with distinct grip.** Players should feel the difference between the front pushing wide and the rear stepping out.
2. **Make throttle control rear traction.** More power can sustain or deepen a slide; excessive power can lose it. Remove the artificial drift acceleration boost once the replacement model works.
3. **Give countersteering meaningful consequences.** A well-timed correction should catch rotation, while an inappropriate input can cause a spin.
4. **Make grip recovery progressive.** Lifting should change forces and weight distribution rather than guarantee recovery. Its effect depends on the vehicle state.
5. **Apply the handbrake to the rear axle.** A short pull should initiate or adjust a slide; holding it should sacrifice speed.
6. **Separate assistance from physical behaviour.** Offer assisted and reduced-assistance handling using the same underlying car model.

A compact two-axle model is the recommended starting point. Explicit wheel-speed dynamics and slip ratio are later improvements for more convincing wheelspin and drivetrain response.

### Input implications

The keyboard's current steering ramp takes about 0.8 seconds to reach full lock. Faster countersteer response and predictable throttle modulation should be tested with the new physics. Analogue controller support would allow more direct steering and throttle control.

Touch input needs its own tuning: pointing a stick at a desired heading is an assisted control interface, whereas keyboard steering is a direct left/right request. Both should drive the same physical model through explicit input and assistance layers.

Desktop should continue to hide the touch joystick and pedals and show keyboard hints, as requested.

## Recommended engagement changes

The current scoring does not distinguish a precise corner from repeatedly sliding around an open area. Introduce meaningful objectives while preserving free practice.

| Priority | Proposed change | Intended benefit |
| --- | --- | --- |
| 1 | Untimed practice, quick reset and three lessons: initiate, sustain, transition | Makes learning the new handling approachable |
| 2 | Clipping points and outer zones | Gives each corner a clear precision challenge |
| 3 | Clean transition bonuses | Rewards connecting opposite-direction drifts |
| 4 | Angle quality and forward-progress checks | Rewards controlled slides and limits incidental-spin scoring |
| 5 | Personal-best ghost and corner results | Shows exactly where the player improved |
| 6 | Short challenges with medals | Gives each retry a specific purpose |

These are recommendations to validate, not measured engagement outcomes. Angle targets should suit each corner rather than reward ever-increasing sideways angle without limit. Progress checks should be mode-specific so deliberate donut practice remains meaningful in the lot.

### Feedback

Use feedback to explain the car's state:

- Tyre sound should communicate approaching or exceeding available grip.
- Engine revs should respond to wheelspin once the model supports it.
- Visible front-wheel steering should communicate countersteer.
- Results should explain line quality, transitions and where points were lost.

Preserve the existing rubber drawing at the end of a run as a distinctive record of the player's driving.

## Implementation sequence

### 1. Establish one convincing car on the practice lot

- Adapt the native force model to TypeScript as a starting point.
- Handle units and coordinate conventions explicitly: the native model uses metres and counter-clockwise, y-up angles; the web model uses pixel world units and clockwise, y-down angles.
- Keep the existing model available for controlled comparison during development.
- Add untimed practice and a quick reset.
- Start with the native model's fixed-step approach and validate numerical stability and performance on web targets.

### 2. Tune inputs and assistance

- Test faster keyboard countersteer response and predictable throttle modulation.
- Add analogue controller support.
- Tune the touch heading controller separately from keyboard steering.
- Keep assistance explicit and compare assisted and reduced-assistance behaviour.
- Recheck camera lookahead and course scale against the new speeds and turning behaviour.

### 3. Build one scored corner sequence

- Add clipping zones and clean-transition rewards.
- Define angle-quality and forward-progress scoring.
- Provide an understandable results breakdown.
- Keep scoring deterministic and tied to physics time.

### 4. Expand after playtesting

- Add short challenges, personal-best ghosts and additional courses after the core slide feels satisfying.
- Version best scores and ghost recordings when physics or scoring changes make older runs incomparable.

## Verification and acceptance

### Automated checks

- Deterministic results for identical input sequences.
- Combined tyre force remains within the model's traction limits.
- Countersteer recovery, excessive-input spin and handbrake-release scenarios.
- Left/right symmetry on equivalent manoeuvres.
- Low-speed stability, stopping and finite outputs through spins.
- Timestep convergence and no artificial energy gain in unpowered scenarios.
- Comparable scripted manoeuvres across native and web implementations after unit and coordinate conversion.
- Nearby flows: asphalt/grass transitions, circuit driving, lot driving, input schemes and assistance levels.
- Scoring regression cases for clean transitions, spins, stationary angle changes, zone re-entry and run completion.

Existing automated drivers remain useful for drivability checks. They should not be the sole tuning target or be treated as proof that the handling feels authentic or fun.

### Human playtests

Compare the existing and proposed handling with both new players and experienced drifting-game players. Include keyboard, touch and analogue controls where supported.

Measure:

- Time to the first successful drift.
- Ability to repeat a successful drift intentionally.
- Ability to connect two opposite-direction corners.
- Whether players can explain why they lost control.
- Willingness to retry and preference between handling versions.
- Perceived responsiveness, predictability and authenticity.

Set numeric acceptance thresholds after collecting a baseline rather than inventing unsupported targets.

## Monitoring

Treat this as a manual development and playtesting programme. Recurring external monitoring is not currently necessary. Revisit the findings when the force-based prototype has measured playtest results or when a specific vehicle-realism question requires further evidence.
