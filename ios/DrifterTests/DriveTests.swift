import XCTest
@testable import Drifter

/// Whole-game drivers, like the web suite: tune the physics against these,
/// not against how a change feels.
final class DriveTests: XCTestCase {
    let track = buildTrack(circuitDef)
    let dt = Config.loop.fixedDt

    struct Outcome {
        var laps = 0
        var offSeconds = 0.0
        var driftSeconds = 0.0
        var maxExcursion = 0.0
    }

    /// Runs a driver round the circuit through the real control path. `lift`
    /// gives it the ghost's automatic corner lift; a player on the pedals has none.
    private func drive(seconds: Double, assist: Bool, lift: Bool, driver: (CarState, TrackQuery, Double) -> RawControls) -> Outcome {
        let start = startPose(track)
        var car = CarState(x: start.x, y: start.y, heading: start.heading)
        var input = InputState()
        var out = Outcome()
        var offTrack = false
        var prevF = 0.0
        var t = 0.0
        let half = track.width / 2
        for _ in 0..<Int(seconds * 120) {
            let q = nearestOnTrack(track, x: car.x, y: car.y)
            let tp = track.points[q.index]
            let roadHeading = atan2(tp.ty, tp.tx)
            offTrack = q.distance > half
            let raw = driver(car, q, t)
            advanceControls(&input, raw: raw, dt: dt, throttleSeconds: Config.input.throttleSeconds)
            var a = DriveAssist.none
            if assist && abs(input.steer) < 0.05 {
                a.steer = roadAssistSteer(heading: car.heading, roadHeading: roadHeading, drifting: car.drifting, offTrack: offTrack)
            }
            if lift {
                a.lift = cornerLift(forwardSpeed: car.forwardSpeed, minRadius: minRadiusAhead(track, index: q.index, distance: liftLookahead(forwardSpeed: car.forwardSpeed)))
            }
            stepCar(&car, input: input, dt: dt, surface: offTrack ? .grass : .asphalt, assist: a)
            t += dt
            if offTrack { out.offSeconds += dt }
            out.maxExcursion = max(out.maxExcursion, q.distance - half)
            if car.drifting { out.driftSeconds += dt }
            let f = q.s / track.length
            if prevF > 0.8 && f < 0.2 { out.laps += 1 }
            prevF = f
        }
        return out
    }

    func testGhostLapsTheCircuitOnTheRoad() {
        let out = drive(seconds: 90, assist: false, lift: true) { car, _, _ in
            let i = autopilot(track: track, car: car)
            return RawControls(steer: i.steer, handbrake: false, throttle: 1)
        }
        XCTAssertGreaterThanOrEqual(out.laps, 2)
        XCTAssertLessThan(out.offSeconds, 1)
        XCTAssertGreaterThan(out.driftSeconds, 10, "a lap on the limit drifts")
    }

    /// A player on the pedals: points the stick down the road with 180 ms of
    /// reaction time, lifts when faster than the bend ahead allows, and flicks
    /// the handbrake into the hairpins. No corner lift and no road assist.
    func testPedalPlayerWithReactionTimeLapsOnTheRoad() {
        var queue: [Double] = []
        let out = drive(seconds: 90, assist: false, lift: false) { car, q, _ in
            let n = track.points.count
            let ahead = Int((6 + car.speed * 0.5).rounded())
            let look = track.points[(q.index + ahead) % n]
            let want = atan2(look.y - car.y, look.x - car.x)
            queue.append(want)
            let target = queue.count > 22 ? queue.removeFirst() : want
            let steer = headingSteer(heading: car.heading, target: target, fullAngle: Config.input.pad.stickFullAngle)
            let bend = minRadiusAhead(track, index: q.index, distance: liftLookahead(forwardSpeed: car.forwardSpeed))
            let limit = cornerSpeed(radius: bend) * 1.1
            let handbrake = car.speed > limit * 1.2 && abs(angleDelta(car.heading, want)) > 0.35
            return RawControls(steer: steer, handbrake: handbrake, throttle: car.speed > limit ? 0 : 1)
        }
        XCTAssertGreaterThanOrEqual(out.laps, 2)
        XCTAssertLessThan(out.offSeconds, 3)
        XCTAssertGreaterThan(out.driftSeconds, 15)
    }

    func testLotPilotStaysOnTheAsphalt() {
        let lot = Config.lot
        let pilot = LotPilot(lot: lot)
        var car = CarState(x: 0, y: 0, heading: .pi / 2)
        var input = InputState()
        var off = 0.0
        var drift = 0.0
        for _ in 0..<(120 * 60) {
            let i = pilot.drive(car, dt: dt)
            advanceControls(&input, raw: RawControls(steer: i.steer, handbrake: i.handbrake, throttle: i.throttle), dt: dt, throttleSeconds: 0)
            let on = lot.contains(x: car.x, y: car.y)
            stepCar(&car, input: input, dt: dt, surface: on ? .asphalt : .grass, assist: .none)
            if !on { off += dt }
            if car.drifting { drift += dt }
        }
        XCTAssertLessThan(off, 2)
        XCTAssertGreaterThan(drift, 5)
    }
}
