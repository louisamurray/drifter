import Foundation

let gravity = 9.81

/// Shortest signed angle from `a` to `b`, in radians.
func angleDelta(_ a: Double, _ b: Double) -> Double {
    var d = (b - a).truncatingRemainder(dividingBy: .pi * 2)
    if d > .pi { d -= .pi * 2 }
    if d < -.pi { d += .pi * 2 }
    return d
}

func clamp(_ v: Double, _ lo: Double, _ hi: Double) -> Double {
    min(hi, max(lo, v))
}

/// The car as a rigid body: a bicycle model with a front and a rear axle,
/// Pacejka tyres, longitudinal weight transfer, a friction circle at the
/// driven rear, and a handbrake that locks the rear into a sliding patch.
struct Vehicle {
    var mass = 1250.0
    var yawInertia = 2100.0
    /// Centre of gravity to the front and rear axles.
    var a = 1.15
    var b = 1.35
    var cgHeight = 0.45
    /// Mechanical lock at the wheel, radians.
    var maxSteer = 0.6
    /// Lateral g the lock schedule plans for, and the front tyre's peak slip angle.
    var limitLateralG = 1.0
    var peakSlip = 0.15
    var minSteer = 0.14
    /// Rear-axle drive force at low speed; falls to zero at `topSpeed` like a torque curve into the limiter.
    var driveForce = 7200.0
    var topSpeed = 38.0
    var engineBrake = 500.0
    /// Brake force for the automatic corner lift (one thumb), split 60/40 front/rear.
    var brakeForce = 6500.0
    var cdA = 0.75
    var airDensity = 1.2
    var rollingCoeff = 0.015
    /// Magic formula shape. The rear is softer and keeps more force past its peak, so a slide is catchable.
    var tyreBFront = 9.5
    var tyreBRear = 7.5
    var tyreCFront = 1.3
    var tyreCRear = 1.25
    var tyreE = 0.95
    /// Rear tyres are wider and stickier than the fronts, so the car understeers at the limit until the gas or handbrake breaks the rear loose.
    var rearGrip = 1.12
    var frontGrip = 0.95
    /// Yaw damping (N m s/rad): suspension and tyre relaxation that stop the nose from whipping.
    var yawDamping = 1200.0
    /// Sliding friction of a locked rear, as a fraction of the surface's.
    var handbrakeMu = 0.75
    /// A driver's instinctive counter-steer towards the direction of travel: lock per radian of body slip, hands off and with a side held.
    var counterSteerGain = 0.85
    var heldCounterSteerGain = 0.35
    var driftEnterSlip = 0.2
    var driftExitSlip = 0.1
    var driftMinSpeed = 7.0
    /// Speed blended into slip angles so they stay finite at a crawl.
    var lowSpeed = 0.8

    var wheelbase: Double { a + b }

    static let standard = Vehicle()
}

/// Friction and resistance of what is under the car.
struct Surface {
    var mu: Double
    /// Multiplier on rolling resistance. Grass is soft.
    var rolling: Double
    /// Multiplier on drive force. Grass spins the wheels.
    var drive: Double

    static let asphalt = Surface(mu: 1.0, rolling: 1.0, drive: 1.0)
    static let grass = Surface(mu: 0.6, rolling: 6.0, drive: 0.5)
}

struct CarState {
    var x: Double
    var y: Double
    /// Radians, counter-clockwise, 0 = +x.
    var heading: Double
    /// Body-frame velocity: forward and left.
    var vx = 0.0
    var vy = 0.0
    var yawRate = 0.0
    /// Road wheel angle actually applied, after assists.
    var steer = 0.0
    /// Body slip angle, signed.
    var slip = 0.0
    var drifting = false
    /// Longitudinal acceleration last step, for weight transfer.
    var ax = 0.0
    var loadFront = 0.0
    var loadRear = 0.0
    var slipFront = 0.0
    var slipRear = 0.0
    /// 0..1 how far the drive force exceeded the rear's grip.
    var wheelspin = 0.0

    init(x: Double = 0, y: Double = 0, heading: Double = .pi / 2) {
        self.x = x
        self.y = y
        self.heading = heading
    }

    var speed: Double { (vx * vx + vy * vy).squareRoot() }
    var forwardSpeed: Double { vx }
    var lateralSpeed: Double { vy }
    /// Angle between heading and velocity, signed; 0 when driving straight.
    var slipAngle: Double { speed > 1 ? atan2(vy, vx) : 0 }
    var worldVelocity: (x: Double, y: Double) {
        let c = cos(heading), s = sin(heading)
        return (c * vx - s * vy, s * vx + c * vy)
    }
}

struct InputState {
    /// 0 (off) to 1 (full throttle).
    var throttle = 0.0
    /// -1 (full right) to 1 (full left): positive turns counter-clockwise, like the heading.
    var steer = 0.0
    var handbrake = false
}

/// What the game adds to the player's steering and pedals.
struct DriveAssist {
    /// Extra road-wheel angle from road assist, radians.
    var steer = 0.0
    /// 0..1 scale on the counter-steer instinct.
    var counter = 1.0
    /// 0..1 corner lift: throttle off and the brakes on.
    var lift = 0.0

    static let none = DriveAssist(steer: 0, counter: 1, lift: 0)
}

/// Pacejka magic formula, normalised to a peak of 1.
@inline(__always)
private func magic(_ alpha: Double, _ B: Double, _ C: Double, _ E: Double) -> Double {
    let Ba = B * alpha
    return sin(C * atan(Ba - E * (Ba - atan(Ba))))
}

/// Usable lock at a speed: the Ackermann angle for a corner at the lateral
/// limit plus the tyre's peak slip angle. Full steer asks for maximum
/// cornering force rather than a saturated front axle, which is what a driver
/// does with the wheel. Counter-steer is added on top, up to the mechanical lock.
func steerLock(speed: Double, vehicle v: Vehicle = .standard) -> Double {
    let vv = max(speed, 1)
    let ackermann = atan((v.wheelbase * v.limitLateralG * gravity) / (vv * vv))
    return clamp(ackermann + v.peakSlip, v.minSteer, v.maxSteer)
}

/// One physics step. Mutates `car`.
func stepCar(
    _ car: inout CarState,
    input: InputState,
    dt: Double,
    vehicle v: Vehicle = .standard,
    surface: Surface = .asphalt,
    assist: DriveAssist = .none
) {
    let m = v.mass
    let L = v.wheelbase
    let speed = car.speed

    // Drift state with hysteresis on body slip
    let bodySlip = speed > 1 ? atan2(car.vy, car.vx) : 0
    car.slip = bodySlip
    if car.drifting {
        car.drifting = abs(bodySlip) > v.driftExitSlip && speed > v.driftMinSpeed * 0.6
    } else {
        car.drifting = abs(bodySlip) > v.driftEnterSlip && speed > v.driftMinSpeed
    }

    // Steering: the player's lock, the road assist, and the counter-steer instinct
    let lock = steerLock(speed: speed, vehicle: v)
    var delta = input.steer * lock + assist.steer
    let counterGain = (input.steer == 0 ? v.counterSteerGain : v.heldCounterSteerGain) * assist.counter
    if car.vx > 2 { delta += counterGain * bodySlip }
    delta = clamp(delta, -v.maxSteer, v.maxSteer)
    car.steer = delta

    // Vertical loads with longitudinal weight transfer from last step's acceleration
    let weight = m * gravity
    let transfer = clamp((m * car.ax * v.cgHeight) / L, -0.4 * weight, 0.4 * weight)
    let fzf = (weight * v.b) / L - transfer
    let fzr = (weight * v.a) / L + transfer
    car.loadFront = fzf
    car.loadRear = fzr

    // Axle slip angles
    let vxAbs = max(abs(car.vx), v.lowSpeed)
    let sgn: Double = car.vx >= 0 ? 1 : -1
    let alphaF = atan2(car.vy + v.a * car.yawRate, vxAbs) * sgn - delta
    let alphaR = atan2(car.vy - v.b * car.yawRate, vxAbs) * sgn
    car.slipFront = alphaF
    car.slipRear = alphaR

    // Longitudinal forces: drive, engine braking and lift braking
    let mu = surface.mu
    let speedFrac = min(1, speed / v.topSpeed)
    var fxr = 0.0
    var fxf = 0.0
    let brake = assist.lift * v.brakeForce
    if !input.handbrake {
        fxr += input.throttle * (1 - assist.lift) * v.driveForce * surface.drive * max(0, 1 - speedFrac * speedFrac * speedFrac)
        if input.throttle < 0.05 && car.vx > 0.5 { fxr -= v.engineBrake }
        if car.vx > 0.5 {
            fxr -= brake * 0.4
            fxf -= brake * 0.6
        }
    }

    // Front tyre: braking demand eats lateral capacity (friction circle)
    let peakF = mu * v.frontGrip * fzf
    fxf = clamp(fxf, -0.95 * peakF, 0.95 * peakF)
    let latCapF = max(0, peakF * peakF - fxf * fxf).squareRoot()
    let fyf = -latCapF * magic(alphaF, v.tyreBFront, v.tyreCFront, v.tyreE)

    // Rear tyre: driven, or locked by the handbrake into pure sliding friction
    var fyr = 0.0
    car.wheelspin = 0
    if input.handbrake {
        let pvx = car.vx
        let pvy = car.vy - v.b * car.yawRate
        let pv = (pvx * pvx + pvy * pvy).squareRoot()
        let f = v.handbrakeMu * mu * fzr * min(1, pv / 1.5)
        fxr = pv > 1e-3 ? (-f * pvx) / pv : 0
        fyr = pv > 1e-3 ? (-f * pvy) / pv : 0
    } else {
        let peakR = mu * v.rearGrip * fzr
        if abs(fxr) > 0.95 * peakR {
            car.wheelspin = min(1, (abs(fxr) - 0.95 * peakR) / (0.6 * peakR))
            fxr = (fxr < 0 ? -1 : 1) * 0.95 * peakR
        }
        let latCapR = max(0, peakR * peakR - fxr * fxr).squareRoot()
        fyr = -latCapR * magic(alphaR, v.tyreBRear, v.tyreCRear, v.tyreE)
    }

    // Aerodynamic drag and rolling resistance
    let drag = 0.5 * v.airDensity * v.cdA * speed
    let rolling = v.rollingCoeff * surface.rolling * weight
    let rollX = speed > 0.05 ? (-rolling * car.vx) / speed : 0
    let rollY = speed > 0.05 ? (-rolling * car.vy) / speed : 0

    // Sum in the body frame
    let cosD = cos(delta), sinD = sin(delta)
    let fx = fxr + fxf * cosD - fyf * sinD - drag * car.vx + rollX
    let fy = fyr + fyf * cosD + fxf * sinD - drag * car.vy + rollY
    let mz = v.a * (fyf * cosD + fxf * sinD) - v.b * fyr - v.yawDamping * car.yawRate

    let ax = fx / m
    let ay = fy / m
    car.ax = ax
    car.yawRate += (mz / v.yawInertia) * dt
    // Yaw damping at a crawl so the car settles instead of twitching
    if speed < 2 { car.yawRate *= exp(-3 * dt) }

    // Accelerate in the body frame, then rotate the velocity exactly by the yaw step
    // (an explicit Coriolis term would pump energy into a spin)
    let pvx = car.vx + ax * dt
    let pvy = car.vy + ay * dt
    let turn = car.yawRate * dt
    let ct = cos(turn), st = sin(turn)
    let nvx = pvx * ct + pvy * st
    let nvy = -pvx * st + pvy * ct
    // Resistance must not reverse the velocity
    car.vx = (abs(nvx) < 0.02 && abs(car.vx) < 0.5 && input.throttle == 0) ? 0 : nvx
    car.vy = nvy
    car.heading += turn
    let c = cos(car.heading), s = sin(car.heading)
    car.x += (c * car.vx - s * car.vy) * dt
    car.y += (s * car.vx + c * car.vy) * dt
}

/// Road assist: with no steering held and on asphalt, the wheel eases
/// towards the road direction. Softer mid-drift so a slide exits on the
/// player's terms. Zero off the road, so the grass still punishes.
func roadAssistSteer(heading: Double, roadHeading: Double, drifting: Bool, offTrack: Bool) -> Double {
    if offTrack { return 0 }
    let err = angleDelta(heading, roadHeading)
    let steer = clamp(err * 0.9, -0.35, 0.35)
    return drifting ? steer * 0.5 : steer
}

/// Speed the car can carry round a centreline of radius `radius`: v = sqrt(k mu g r).
func cornerSpeed(radius: Double, vehicle v: Vehicle = .standard, mu: Double = 1, k: Double = 0.9) -> Double {
    min(v.topSpeed, (k * mu * gravity * radius).squareRoot())
}

/// Corner lift amount, 0 to 1, from the forward speed and the tightest radius
/// within the lookahead. Ramps in over `band` m/s above the corner speed.
func cornerLift(forwardSpeed: Double, minRadius: Double, band: Double = 3) -> Double {
    let over = forwardSpeed - cornerSpeed(radius: minRadius)
    if over <= 0 { return 0 }
    return min(1, over / band)
}

/// How far ahead the lift looks: a reaction time plus the distance to brake to the tightest corner at a comfortable rate.
func liftLookahead(forwardSpeed: Double, reaction: Double = 0.5, decel: Double = 4.5, minimum: Double = 12) -> Double {
    let v = max(0, forwardSpeed)
    return max(minimum, v * reaction + (v * v) / (2 * decel))
}
