# Drifter for iOS

A native, fully offline iOS version of Drifter. Swift, SpriteKit and SwiftUI,
no network code, nothing downloaded at runtime: the fonts are bundled and the
sound is synthesised. Same two courses, same scoring and the same rubber
drawing at the end of a run. One control scheme: the left thumb drives on a
gas pedal and a handbrake, the right thumb points a stick where the car
should go. The directional stick is what makes a real car drivable with a
thumb: when the tail steps out, pointing where you want to go is counter-steer.

What changed from the web game is the car. Instead of the arcade slide model it
is a rigid body on real tyres, tuned so a thumb can still drive it:

- A bicycle model with a front and a rear axle, mass, yaw inertia and a centre
  of gravity. Accelerating shifts weight to the rear; lifting shifts it forward.
- Pacejka "magic formula" tyres. Each axle's lateral force rises with its slip
  angle to a peak and then falls away, which is what makes a slide hold.
- A friction circle at the driven rear: drive force spends grip the tyre then
  cannot use sideways, so the gas is what breaks the rear loose.
- The handbrake locks the rear into pure sliding friction, so a flick steps the
  tail out at any speed.
- Aerodynamic drag, rolling resistance, a torque curve that runs out at the
  limiter, and a grass surface with half the grip and six times the rolling
  resistance.
- Two things a driver does with the wheel, so the thumb does not have to: the
  usable lock shrinks with speed to the angle that gives peak cornering force,
  and the wheel counter-steers towards the direction of travel in a slide.

Everything is tuned against the test suite, not by feel: the title ghost must
lap the circuit on the road, a player on the stick and pedals with 180 ms of
reaction time must lap on the road while drifting, and a figure-of-eight
pilot must stay on the asphalt of the lot.

## Building

Requires Xcode 16 or newer and iOS 17 or newer on the device.

1. Open `ios/Drifter.xcodeproj`.
2. Select your team under Signing & Capabilities on the Drifter target.
3. Run on an iPhone. The simulator works too, but there are no haptics and
   the controls need two fingers.

Tests run from Xcode (⌘U) or the command line:

```sh
xcodebuild test -project ios/Drifter.xcodeproj -scheme Drifter \
  -destination 'platform=iOS Simulator,name=iPhone 16'
```

The project uses Xcode 16 synchronized folders, so adding a file under
`Drifter/` or `DrifterTests/` adds it to the target. `project.yml` is an
equivalent XcodeGen spec should the project ever need regenerating.

## Layout

```
Drifter/
  App/        SwiftUI entry, the view model bridging the scene, menu screens
  Game/       physics, track, lot, scoring, laps, controls, autopilot, run state, camera
  Render/     SpriteKit scene, car, course, grass, rubber, smoke, in-game HUD, palette
  Audio/      AVAudioEngine procedural engine, squeal and chimes
  Core/       Core Haptics
  Resources/  Archivo Expanded (SIL OFL), converted from the web bundle
DrifterTests/ physics, course, scoring, controls and whole-game drivers
```

## Performance notes

- Physics runs at a fixed 120 Hz from an accumulator; rendering interpolates
  between steps, so the car moves identically on 60 Hz and ProMotion screens.
- Grass is a grid of sprites sharing one texture, the smoke is a pool of
  sprites sharing one texture, and rubber is batched a few dozen segments per
  shape node, so a frame is a handful of draw calls plus the car.
- The in-game HUD lives in the scene; SwiftUI only draws the menus, so the
  loop never invalidates the view hierarchy while playing.
- Audio is one source node rendering a few oscillators, a band-passed noise
  and short enveloped blips, with parameters smoothed per sample.

## Units

Metres, seconds and radians, y up, angles counter-clockwise. The web game's
pixels map at 10 px per metre, so the circuit and the lot are the same size
and the car is 4 m long.
