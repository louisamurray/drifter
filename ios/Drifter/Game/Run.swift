import Foundation

enum PopupKind {
    case bank, lost, lap, multiplier
}

enum HapticKind {
    case firstDrift, bank, multiplier, tick, go
}

enum Sfx {
    case tick, go, multiplier, bank, wide
}

/// Things the renderer, audio and haptics react to. Drained once per frame.
enum RunEvent {
    case popup(text: String, kind: PopupKind)
    case shake(amplitude: Double, duration: Double)
    case haptic(HapticKind)
    case sfx(Sfx, amount: Double)
    case stateChanged(from: GameState, to: GameState)
}

/// Per-step cues that make the car read as driven, not just moved.
struct CarLook {
    /// Road wheel angle, radians, for the front wheels.
    var steer = 0.0
    /// Signed slip ratio -1..1; shifts the body on its wheels in a slide.
    var roll = 0.0
    /// 0..1 tail-light intensity: handbrake or corner lift.
    var brake = 0.0
}

struct AudioTelemetry {
    var speedRatio = 0.0
    var throttle = 0.0
    var drifting = false
    var handbrake = false
    /// 0..1 slide intensity, as used for skids and smoke.
    var slide = 0.0
    var offTrack = false
    var wheelspin = 0.0
}

/// The whole game apart from drawing and sound: the course, the car, the
/// score, the state machine, and the events they raise. The scene steps it
/// at a fixed rate and reads it to draw.
final class Run {
    let track = buildTrack(circuitDef)
    let trackExtent: Bounds
    let lot = Config.lot
    let vehicle = Vehicle.standard

    private(set) var mode: GameMode
    private(set) var scheme: ControlScheme
    private(set) var state: GameState = .title

    var car: CarState
    var prev: CarState
    private(set) var laps = LapState()
    private(set) var score = ScoreState()
    private(set) var offTrack = false
    private var roadHeading: Double
    private var trackIndex = 0
    private(set) var bests: [GameMode: Double]
    private(set) var newBest = false
    private(set) var countdownLeft = 0.0
    private var lastTick = 0
    private(set) var look = CarLook()
    private(set) var everDrifted = false
    private var lotGhost: LotPilot
    let controls = TouchControls()
    var camera: Camera
    private(set) var audio = AudioTelemetry()
    /// 0..1 how hard the car is sliding this step, for rubber and smoke. Zero off the road.
    private(set) var slideIntensity = 0.0
    private(set) var events: [RunEvent] = []

    /// Screen size in points, set by the scene.
    var viewportWidth = 390.0
    var viewportHeight = 844.0
    /// Free band between the game-over score and its buttons, in points from the top.
    var overviewBandTop = 200.0
    var overviewBandBottom = 600.0

    init() {
        trackExtent = trackBounds(track)
        mode = Storage.loadMode()
        scheme = Storage.loadScheme()
        let start = mode == .track ? startPose(track) : Lot.startPose
        car = CarState(x: start.x, y: start.y, heading: start.heading)
        prev = car
        roadHeading = start.heading
        bests = [.track: Storage.loadBest(.track), .free: Storage.loadBest(.free)]
        lotGhost = LotPilot(lot: Config.lot)
        camera = Camera(car: car)
        controls.scheme = scheme
        resetRun()
    }

    var start: Pose {
        mode == .track ? startPose(track) : Lot.startPose
    }

    /// Extent of the asphalt and the margin around it, for the rubber layer and the overview.
    var courseBounds: (bounds: Bounds, pad: Double) {
        mode == .track ? (trackExtent, track.width) : (lot.bounds, 4)
    }

    var best: Double { bests[mode] ?? 0 }

    /// True until a new player has lapped the circuit or banked a chain on the lot.
    var learning: Bool {
        best == 0 && (mode == .track ? laps.laps == 0 : score.score == 0)
    }

    func drainEvents() -> [RunEvent] {
        let out = events
        events = []
        return out
    }

    private func resetRun() {
        let s = start
        car = CarState(x: s.x, y: s.y, heading: s.heading)
        prev = car
        laps = LapState()
        score = ScoreState()
        offTrack = false
        roadHeading = s.heading
        trackIndex = 0
        newBest = false
        everDrifted = false
        look = CarLook()
        slideIntensity = 0
        lotGhost = LotPilot(lot: lot)
        controls.reset()
    }

    // MARK: - State

    func setState(_ next: GameState) {
        let from = state
        state = next
        switch next {
        case .title:
            resetRun()
        case .countdown:
            resetRun()
            countdownLeft = Config.scoring.countdownSeconds
            lastTick = Int(countdownLeft.rounded(.up)) + 1
        case .playing, .paused:
            break
        case .gameover:
            controls.reset()
            newBest = score.score > best
            if newBest {
                bests[mode] = score.score
                Storage.saveBest(mode, score.score)
            }
        }
        events.append(.stateChanged(from: from, to: next))
    }

    func startRun() {
        setState(.countdown)
    }

    func pause() {
        if state == .playing { setState(.paused) }
    }

    func resume() {
        if state == .paused {
            controls.reset()
            setState(.playing)
        }
    }

    func restart() {
        setState(.countdown)
    }

    func backToTitle() {
        setState(.title)
    }

    func setScheme(_ next: ControlScheme) {
        guard next != scheme else { return }
        scheme = next
        Storage.saveScheme(next)
        controls.scheme = next
        controls.reset()
    }

    func setMode(_ next: GameMode) {
        guard next != mode else { return }
        mode = next
        Storage.saveMode(next)
        setState(.title)
    }

    // MARK: - Simulation

    /// `manual` means the player is on the gas pedal: no corner lift, and tail
    /// lights when they lift. `pointed` means a thumb is on the stick: the
    /// stick owns the heading, so road assist stays out of it.
    private func stepPhysics(dt: Double, ctl: InputState, manual: Bool, pointed: Bool) {
        prev = car
        let onRoad = mode == .track
        var assist = DriveAssist.none
        if onRoad && !pointed && abs(ctl.steer) < 0.05 {
            assist.steer = roadAssistSteer(heading: car.heading, roadHeading: roadHeading, drifting: car.drifting, offTrack: offTrack)
        }
        if onRoad && !manual {
            let look = liftLookahead(forwardSpeed: car.forwardSpeed)
            assist.lift = cornerLift(forwardSpeed: car.forwardSpeed, minRadius: minRadiusAhead(track, index: trackIndex, distance: look))
        }
        stepCar(&car, input: ctl, dt: dt, vehicle: vehicle, surface: offTrack ? .grass : .asphalt, assist: assist)
        look.steer = car.steer
        look.brake = ctl.handbrake ? 1 : max(assist.lift, manual && ctl.throttle < 0.5 && car.speed > 3 ? 0.6 : 0)

        let lapsBefore = laps.laps
        if onRoad {
            let q = nearestOnTrack(track, x: car.x, y: car.y)
            trackIndex = q.index
            let tp = track.points[q.index]
            roadHeading = atan2(tp.ty, tp.tx)
            offTrack = isOffTrack(track, distance: q.distance)
            updateLaps(&laps, s: q.s, trackLength: track.length, dt: dt)
        } else {
            offTrack = !lot.contains(x: car.x, y: car.y)
        }

        let slip = car.slipAngle
        let slide = min(1, abs(slip) / Config.juice.fullIntensitySlip)
        look.roll = clamp(slip / Config.juice.fullIntensitySlip, -1, 1)
        slideIntensity = car.drifting && !offTrack ? slide : 0
        if slideIntensity > 0 && !everDrifted {
            everDrifted = true
            if state == .playing { events.append(.haptic(.firstDrift)) }
        }
        audio = AudioTelemetry(
            speedRatio: car.speed / vehicle.topSpeed,
            throttle: ctl.throttle,
            drifting: car.drifting,
            handbrake: ctl.handbrake,
            slide: slide,
            offTrack: offTrack,
            wheelspin: car.wheelspin
        )

        if state == .playing {
            updateScore(&score, input: ScoreInput(
                drifting: car.drifting,
                offTrack: offTrack,
                slipAngle: slip,
                speed: car.speed,
                lapCompleted: laps.laps > lapsBefore,
                handbrake: ctl.handbrake
            ), dt: dt)
            handleScoreEvents()
            if score.finished { setState(.gameover) }
        }
        camera.follow(car, speed: car.speed, dt: dt)
    }

    private func handleScoreEvents() {
        for e in score.drainEvents() {
            switch e {
            case .bank(let amount):
                events.append(.popup(text: "+\(formatScore(amount))", kind: .bank))
                let j = Config.juice
                let amp = min(j.shakeMax, j.shakeBase + log10(max(1, amount)) * j.shakePerDecade)
                events.append(.shake(amplitude: amp, duration: j.shakeDuration))
                events.append(.haptic(.bank))
                events.append(.sfx(.bank, amount: amount))
            case .lost(_, let kept):
                events.append(.popup(text: "+\(formatScore(kept))  ran wide", kind: .lost))
                events.append(.sfx(.wide, amount: 0))
            case .lap(let bonus):
                events.append(.popup(text: "LAP +\(formatScore(bonus))", kind: .lap))
            case .multiplier(let value):
                let text = value == value.rounded() ? "×\(Int(value))" : "×\(value)"
                events.append(.popup(text: text, kind: .multiplier))
                events.append(.haptic(.multiplier))
                events.append(.sfx(.multiplier, amount: 0))
            }
        }
    }

    /// The course's own driver: laps the circuit, or draws an eight on the lot.
    private func ghostInput(dt: Double) -> InputState {
        mode == .track ? autopilot(track: track, car: car) : lotGhost.drive(car, dt: dt)
    }

    /// One fixed step.
    func update(dt: Double) {
        switch state {
        case .title:
            stepPhysics(dt: dt, ctl: ghostInput(dt: dt), manual: false, pointed: false)
        case .countdown:
            countdownLeft -= dt
            let tick = Int(countdownLeft.rounded(.up))
            if tick < lastTick {
                lastTick = tick
                events.append(.sfx(tick <= 0 ? .go : .tick, amount: 0))
                events.append(.haptic(tick <= 0 ? .go : .tick))
            }
            audio = AudioTelemetry()
            prev = car
            camera.follow(car, speed: 0, dt: dt)
            if countdownLeft <= -0.4 { setState(.playing) }
        case .playing:
            let manual = scheme == .pedals
            controls.carHeading = car.heading
            let ctl = controls.sample(dt: dt)
            stepPhysics(dt: dt, ctl: ctl, manual: manual, pointed: manual && controls.stickHeld)
        case .paused:
            break
        case .gameover:
            prev = car
            let c = courseBounds
            let o = Camera.fitOverview(bounds: c.bounds, pad: c.pad, viewWidth: viewportWidth, viewHeight: viewportHeight, bandTop: overviewBandTop, bandBottom: overviewBandBottom)
            camera.move(toX: o.x, y: o.y, zoom: o.zoom, dt: dt)
        }
    }
}
