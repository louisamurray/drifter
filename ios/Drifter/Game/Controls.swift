import Foundation

/// One thumb: touching the left half of the screen steers left at full lock,
/// the right half steers right. Holding both is the handbrake. The car
/// accelerates by itself and lifts for corners it is going too fast for.
///
/// Two thumbs: controls in the bottom corners. The left thumb drives on two
/// pedals, gas in the corner and the handbrake beside it. The right thumb
/// points a stick where the car should go. Nothing moves the car but the gas.
enum ControlScheme: String, CaseIterable {
    case thumb
    case pedals

    var title: String {
        switch self {
        case .thumb: return "One thumb"
        case .pedals: return "Two thumbs"
        }
    }
}

enum Zone: CaseIterable {
    case left, right, brake, gas, stick
}

/// Where the two-thumb controls sit, in points.
struct PadLayout {
    /// Gap from the screen edges (the safe area is added on top).
    var inset: Double
    /// Pedal diameter and the gap between the two pedals.
    var pedalSize: Double
    var pedalGap: Double
    /// Stick base radius.
    var stickRadius: Double
    /// Heading error, in radians, at which the stick asks for full lock.
    var stickFullAngle: Double
    /// Touches above this fraction of the screen height (from the top) are not controls.
    var bandTop: Double
}

struct RawControls {
    /// -1..1. Digital unless `analog`.
    var steer: Double
    /// True when steer comes from the stick and should be applied as is, not ramped.
    var analog: Bool
    var handbrake: Bool
    var throttle: Double
}

struct SteerRamp {
    var stage1: Double
    var stage1Seconds: Double
    var stage2Seconds: Double
    var releaseSeconds: Double
}

/// Within this fraction of the stick radius the thumb counts as centred.
let stickDeadzone = 0.18

/// Which control a touch at (x, y) lands on, in a top-left-origin screen of
/// the given size, or nil when it is not a control.
func zoneAt(x: Double, y: Double, width: Double, height: Double, scheme: ControlScheme, pad: PadLayout) -> Zone? {
    if scheme == .thumb { return x < width / 2 ? .left : .right }
    if y < height * pad.bandTop { return nil }
    if x >= width / 2 { return .stick }
    return x < pad.inset + pad.pedalSize + pad.pedalGap / 2 ? .gas : .brake
}

/// The heading a stick thumb asks for, from its offset (dx, dy) in y-up
/// screen points from the stick centre. Nil inside the deadzone.
func stickHeading(dx: Double, dy: Double, radius: Double) -> Double? {
    if hypot(dx, dy) < radius * stickDeadzone { return nil }
    return atan2(dy, dx)
}

/// Steer that turns `heading` towards `target` the short way: full lock from `fullAngle` of error.
func headingSteer(heading: Double, target: Double, fullAngle: Double) -> Double {
    clamp(angleDelta(heading, target) / fullAngle, -1, 1)
}

/// Pure mapping from held zones (in press order) and the stick to steer,
/// handbrake and throttle. Left is positive, like the heading.
func resolveControls(
    heldInOrder: [Zone],
    scheme: ControlScheme,
    stick: Double? = nil,
    heading: Double = 0,
    fullAngle: Double = 0.6
) -> RawControls {
    let left = heldInOrder.contains(.left)
    let right = heldInOrder.contains(.right)
    var steer = 0.0
    if left || right {
        let first = heldInOrder.first { $0 == .left || $0 == .right }
        steer = first == .left ? 1 : -1
    }
    if scheme == .thumb {
        let handbrake = left && right
        return RawControls(steer: steer, analog: false, handbrake: handbrake, throttle: handbrake ? 0 : 1)
    }
    let handbrake = heldInOrder.contains(.brake)
    let throttle: Double = heldInOrder.contains(.gas) ? 1 : 0
    if let stick {
        return RawControls(steer: headingSteer(heading: heading, target: stick, fullAngle: fullAngle), analog: true, handbrake: handbrake, throttle: throttle)
    }
    return RawControls(steer: steer, analog: false, handbrake: handbrake, throttle: throttle)
}

/// Two-stage steering ramp. Towards centre, or across it, moves at the release
/// rate. Away from centre, the first stage reaches `stage1` in `stage1Seconds`
/// and the second continues to full lock over `stage2Seconds`.
func rampSteer(current: Double, target: Double, dt: Double, ramp r: SteerRamp) -> Double {
    let crossing = current != 0 && (target > 0) != (current > 0)
    if target == 0 || crossing {
        let step = dt / r.releaseSeconds
        return current > 0 ? max(0, current - step) : min(0, current + step)
    }
    let mag = abs(current)
    let rate = mag < r.stage1 ? r.stage1 / r.stage1Seconds : (1 - r.stage1) / r.stage2Seconds
    return (target > 0 ? 1.0 : -1.0) * min(1, mag + rate * dt)
}

/// Advance the smoothed state by one physics step from raw controls.
func advanceControls(_ state: inout InputState, raw: RawControls, dt: Double, ramp: SteerRamp, throttleSeconds: Double) {
    state.steer = raw.analog ? raw.steer : rampSteer(current: state.steer, target: raw.steer, dt: dt, ramp: ramp)
    state.handbrake = raw.handbrake
    if throttleSeconds > 0 && raw.throttle > state.throttle {
        state.throttle = min(raw.throttle, state.throttle + dt / throttleSeconds)
    } else {
        state.throttle = raw.throttle
    }
}

/// A touch the scene is tracking, in top-left-origin screen points.
struct TrackedTouch {
    var zone: Zone
    var x: Double
    var y: Double
}

/// Touch state and its mapping to controls. The scene feeds it touches in
/// screen points (origin top-left, like UIKit) and samples it each step.
final class TouchControls {
    private(set) var state = InputState()
    private(set) var held: [Zone: Bool] = [:]
    var scheme: ControlScheme = .pedals
    var pad = Config.input.pad
    /// Safe-area insets at the right and bottom edges, for the stick's centre.
    var safeRight = 0.0
    var safeBottom = 0.0
    var screenWidth = 390.0
    var screenHeight = 844.0
    /// The car's heading, which the stick steers towards.
    var carHeading = 0.0
    /// Where the stick thumb is, as a fraction of the radius in each axis (y up), for drawing the knob.
    private(set) var stickX = 0.0
    private(set) var stickY = 0.0

    private var touches: [ObjectIdentifier: TrackedTouch] = [:]
    private var order: [ObjectIdentifier] = []

    init() {
        for z in Zone.allCases { held[z] = false }
    }

    /// Screen position of the stick's centre, top-left origin.
    var stickCentre: (x: Double, y: Double) {
        let r = pad.inset + pad.stickRadius
        return (screenWidth - safeRight - r, screenHeight - safeBottom - r)
    }

    /// Screen position of a pedal's centre, top-left origin.
    func pedalCentre(_ zone: Zone, safeLeft: Double) -> (x: Double, y: Double) {
        let r = pad.pedalSize / 2
        let y = screenHeight - safeBottom - pad.inset - r
        let gasX = safeLeft + pad.inset + r
        return zone == .gas ? (gasX, y) : (gasX + pad.pedalSize + pad.pedalGap, y)
    }

    func began(id: ObjectIdentifier, x: Double, y: Double) {
        guard let zone = zoneAt(x: x, y: y, width: screenWidth, height: screenHeight, scheme: scheme, pad: pad) else { return }
        touches[id] = TrackedTouch(zone: zone, x: x, y: y)
        order.append(id)
    }

    func moved(id: ObjectIdentifier, x: Double, y: Double) {
        guard var t = touches[id] else { return }
        t.x = x
        t.y = y
        touches[id] = t
    }

    func ended(id: ObjectIdentifier) {
        touches[id] = nil
        order.removeAll { $0 == id }
    }

    private func heldInOrder() -> [Zone] {
        order.compactMap { touches[$0]?.zone }
    }

    /// Raw, unsmoothed controls right now.
    func raw() -> RawControls {
        var stick: Double? = nil
        stickX = 0
        stickY = 0
        if let onStick = order.compactMap({ touches[$0] }).first(where: { $0.zone == .stick }) {
            let c = stickCentre
            let r = pad.stickRadius
            let dx = onStick.x - c.x
            let dy = c.y - onStick.y
            stick = stickHeading(dx: dx, dy: dy, radius: r)
            let over = max(1, hypot(dx, dy) / r)
            stickX = dx / r / over
            stickY = dy / r / over
        }
        return resolveControls(heldInOrder: heldInOrder(), scheme: scheme, stick: stick, heading: carHeading, fullAngle: pad.stickFullAngle)
    }

    /// Advance the smoothed state by one physics step.
    @discardableResult
    func sample(dt: Double) -> InputState {
        advanceControls(&state, raw: raw(), dt: dt, ramp: Config.input.steer, throttleSeconds: scheme == .pedals ? Config.input.throttleSeconds : 0)
        let zones = heldInOrder()
        for z in Zone.allCases { held[z] = zones.contains(z) }
        return state
    }

    var stickHeld: Bool { held[.stick] ?? false }

    /// Drop any held input, e.g. when leaving the playing state.
    func reset() {
        touches.removeAll()
        order.removeAll()
        state = InputState()
        for z in Zone.allCases { held[z] = false }
        stickX = 0
        stickY = 0
    }
}
