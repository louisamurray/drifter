import Foundation

/// Controls sit in the bottom corners. The left thumb drives on two pedals,
/// gas in the corner and the handbrake beside it. The right thumb points a
/// stick where the car should go: the stick's direction on screen is the
/// wanted heading, and the car steers towards it, harder the further the
/// nose is from it. Nothing moves the car but the gas. Touches above the
/// control band are ignored.
enum Zone: CaseIterable {
    case brake, gas, stick
}

/// Where the controls sit, in points.
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
    /// -1..1, positive turns counter-clockwise like the heading. Zero with no thumb on the stick.
    var steer: Double
    var handbrake: Bool
    var throttle: Double
}

/// Within this fraction of the stick radius the thumb counts as centred.
let stickDeadzone = 0.18

/// Which control a touch at (x, y) lands on, in a top-left-origin screen of
/// the given size, or nil when it is not a control.
func zoneAt(x: Double, y: Double, width: Double, height: Double, pad: PadLayout, safeLeft: Double = 0) -> Zone? {
    if y < height * pad.bandTop { return nil }
    // Give the whole visible brake pedal to the pedals, even on narrow screens.
    let pedalRight = safeLeft + pad.inset + pad.pedalSize * 2 + pad.pedalGap
    if x >= max(width / 2, pedalRight) { return .stick }
    return x < safeLeft + pad.inset + pad.pedalSize + pad.pedalGap / 2 ? .gas : .brake
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

/// Pure mapping from held zones and the stick to steer, handbrake and throttle.
func resolveControls(held: [Zone], stick: Double?, heading: Double, fullAngle: Double) -> RawControls {
    let steer = stick.map { headingSteer(heading: heading, target: $0, fullAngle: fullAngle) } ?? 0
    return RawControls(steer: steer, handbrake: held.contains(.brake), throttle: held.contains(.gas) ? 1 : 0)
}

/// Advance the smoothed state by one physics step. The stick is applied as
/// is; the throttle rises over `throttleSeconds` and drops at once, so a
/// pressed pedal eases in and a released one lets go.
func advanceControls(_ state: inout InputState, raw: RawControls, dt: Double, throttleSeconds: Double) {
    state.steer = raw.steer
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
    var pad = Config.input.pad
    /// Safe-area insets shared with the drawn pedals and stick.
    var safeLeft = 0.0
    var safeRight = 0.0
    var safeBottom = 0.0
    var screenWidth = 390.0
    var screenHeight = 844.0
    /// The car's heading, which the stick steers towards.
    var carHeading = 0.0
    /// Where the stick thumb is, as a fraction of the radius in each axis (y up), for drawing the knob.
    private(set) var stickX = 0.0
    private(set) var stickY = 0.0

    private var stickTouch: ObjectIdentifier?
    private var touches: [ObjectIdentifier: TrackedTouch] = [:]

    init() {
        for z in Zone.allCases { held[z] = false }
    }

    /// Screen position of the stick's centre, top-left origin.
    var stickCentre: (x: Double, y: Double) {
        let r = pad.inset + pad.stickRadius
        return (screenWidth - safeRight - r, screenHeight - safeBottom - r)
    }

    func began(id: ObjectIdentifier, x: Double, y: Double) {
        guard let zone = zoneAt(x: x, y: y, width: screenWidth, height: screenHeight, pad: pad, safeLeft: safeLeft) else { return }
        if zone == .stick {
            guard stickTouch == nil else { return }
            stickTouch = id
        }
        touches[id] = TrackedTouch(zone: zone, x: x, y: y)
    }

    func moved(id: ObjectIdentifier, x: Double, y: Double) {
        guard var t = touches[id] else { return }
        // Pedals follow the thumb; steering retains ownership until lifted.
        if t.zone != .stick {
            let boundary = safeLeft + pad.inset + pad.pedalSize + pad.pedalGap / 2
            t.zone = x < boundary ? .gas : .brake
        }
        t.x = x
        t.y = y
        touches[id] = t
    }

    func ended(id: ObjectIdentifier) {
        touches[id] = nil
        if stickTouch == id { stickTouch = nil }
    }

    /// Raw, unsmoothed controls right now.
    func raw() -> RawControls {
        var stick: Double? = nil
        stickX = 0
        stickY = 0
        if let id = stickTouch, let onStick = touches[id] {
            let c = stickCentre
            let r = pad.stickRadius
            let dx = onStick.x - c.x
            let dy = c.y - onStick.y
            stick = stickHeading(dx: dx, dy: dy, radius: r)
            let over = max(1, hypot(dx, dy) / r)
            stickX = dx / r / over
            stickY = dy / r / over
        }
        return resolveControls(held: touches.values.map(\.zone), stick: stick, heading: carHeading, fullAngle: pad.stickFullAngle)
    }

    /// Advance the smoothed state by one physics step.
    @discardableResult
    func sample(dt: Double) -> InputState {
        advanceControls(&state, raw: raw(), dt: dt, throttleSeconds: Config.input.throttleSeconds)
        let zones = touches.values.map(\.zone)
        for z in Zone.allCases { held[z] = zones.contains(z) }
        return state
    }

    var stickHeld: Bool { held[.stick] ?? false }

    /// Drop any held input, e.g. when leaving the playing state.
    func reset() {
        touches.removeAll()
        stickTouch = nil
        state = InputState()
        for z in Zone.allCases { held[z] = false }
        stickX = 0
        stickY = 0
    }
}
