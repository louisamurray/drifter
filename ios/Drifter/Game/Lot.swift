import Foundation

/// An open lot: a rounded rectangle of asphalt centred on the origin, grass
/// beyond its edge, and nothing to follow. No road direction means no road
/// assist and no corner lift; the only rule is to stay on the asphalt.
struct Lot {
    var width: Double
    var height: Double
    /// Corner radius of the asphalt.
    var corner: Double
    /// Radius of the painted skidpad ring in the middle.
    var ring: Double
    /// Painted parking bays along the long edges: how deep they reach in and how far apart they are.
    var bayDepth: Double
    var bayPitch: Double

    var bounds: Bounds {
        Bounds(minX: -width / 2, minY: -height / 2, maxX: width / 2, maxY: height / 2)
    }

    /// True when (x, y) is on the asphalt.
    func contains(x: Double, y: Double) -> Bool {
        let hx = width / 2, hy = height / 2
        let ax = abs(x), ay = abs(y)
        if ax > hx || ay > hy { return false }
        let dx = ax - (hx - corner)
        let dy = ay - (hy - corner)
        return dx <= 0 || dy <= 0 || dx * dx + dy * dy <= corner * corner
    }

    /// A run starts in the middle of the lot, facing up it.
    static let startPose = Pose(x: 0, y: 0, heading: .pi / 2)
}

/// A ghost for the title screen: chases a point moving round a figure of
/// eight inside the lot, steering with a stick and pulling the handbrake to
/// swing the nose through the direction changes. The point waits when the
/// car falls behind, so the eight is drawn rather than cut across.
final class LotPilot {
    private let a: Double
    private let b: Double
    private var t = 0.0
    private let speed = 23.0
    private let lead = 14.0
    private let leash = 32.0
    private let limit = 26.0

    init(lot: Lot) {
        a = lot.width * 0.3
        b = lot.height * 0.3
    }

    func drive(_ car: CarState, dt: Double) -> InputState {
        let wx = a * sin(2 * t)
        let wy = -b * sin(t)
        let dist = hypot(wx - car.x, wy - car.y)
        let rate = dist < lead ? speed * 2 : (dist < leash ? speed : 0)
        let pathSpeed = max(1, hypot(2 * a * cos(2 * t), b * cos(t)))
        t += (rate * dt) / pathSpeed

        let err = angleDelta(car.heading, atan2(wy - car.y, wx - car.x))
        let steer = clamp(err / 0.5, -1, 1)
        let handbrake = car.speed > 12 && (abs(err) > 0.7 || car.speed > limit)
        let throttle: Double = handbrake ? 0 : (car.speed > limit * 0.9 ? 0.3 : 1)
        return InputState(throttle: throttle, steer: steer, handbrake: handbrake)
    }
}
