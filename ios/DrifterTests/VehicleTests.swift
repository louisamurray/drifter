import XCTest
@testable import Drifter

final class VehicleTests: XCTestCase {
    let dt = Config.loop.fixedDt

    func testAcceleratesToARealisticTopSpeed() {
        var car = CarState(x: 0, y: 0, heading: 0)
        var t100: Double? = nil
        var t = 0.0
        for _ in 0..<(120 * 20) {
            stepCar(&car, input: InputState(throttle: 1, steer: 0, handbrake: false), dt: dt)
            t += dt
            if t100 == nil && car.speed >= 27.78 { t100 = t }
        }
        XCTAssertNotNil(t100)
        XCTAssertLessThan(t100 ?? 99, 8, "0-100 km/h should take a few seconds")
        XCTAssertGreaterThan(car.speed * 3.6, 110)
        XCTAssertLessThan(car.speed, Vehicle.standard.topSpeed)
        XCTAssertEqual(car.vy, 0, accuracy: 1e-6, "a straight launch stays straight")
    }

    func testHeldSteerIsAStableTurnNotASpin() {
        var car = CarState(x: 0, y: 0, heading: 0)
        for _ in 0..<(120 * 4) {
            stepCar(&car, input: InputState(throttle: 0.55, steer: 0, handbrake: false), dt: dt)
        }
        var maxSlip = 0.0
        for _ in 0..<(120 * 6) {
            stepCar(&car, input: InputState(throttle: 0.55, steer: 1, handbrake: false), dt: dt)
            maxSlip = max(maxSlip, abs(car.slipAngle))
        }
        XCTAssertLessThan(maxSlip, 0.35, "full lock at part throttle must not spin the car")
        XCTAssertGreaterThan(abs(car.yawRate), 0.3, "the car is turning")
        XCTAssertGreaterThan(car.speed, 10)
    }

    func testPowerOverDriftHoldsWithoutSpinning() {
        var car = CarState(x: 0, y: 0, heading: 0)
        car.vx = 15
        var drift = 0.0
        var maxSlip = 0.0
        for i in 0..<(120 * 5) {
            let v = car.worldVelocity
            let travel = atan2(v.y, v.x)
            let want = travel + 0.35
            let steer = i < 60 ? 1 : headingSteer(heading: car.heading, target: want, fullAngle: 0.6)
            stepCar(&car, input: InputState(throttle: 1, steer: steer, handbrake: false), dt: dt, assist: DriveAssist(steer: 0, counter: 0, lift: 0))
            if car.drifting { drift += dt }
            maxSlip = max(maxSlip, abs(car.slipAngle))
        }
        XCTAssertGreaterThan(drift, 3, "the stick holds a slide on the gas")
        XCTAssertGreaterThan(maxSlip, 0.3)
        XCTAssertLessThan(maxSlip, 1.2, "and does not spin")
    }

    func testHandbrakeFlickStartsASlideThatSettles() {
        var car = CarState(x: 0, y: 0, heading: 0)
        car.vx = 20
        var drift = 0.0
        var maxSlip = 0.0
        for i in 0..<(120 * 4) {
            let hb = i < 50
            stepCar(&car, input: InputState(throttle: hb ? 0 : 1, steer: i < 80 ? 1 : 0, handbrake: hb), dt: dt)
            if car.drifting { drift += dt }
            maxSlip = max(maxSlip, abs(car.slipAngle))
        }
        XCTAssertGreaterThan(drift, 0.8)
        XCTAssertGreaterThan(maxSlip, 0.3)
        XCTAssertLessThan(abs(car.slipAngle), 0.1, "the counter-steer instinct catches the slide")
    }

    func testGrassIsSlowerAndLooser() {
        var road = CarState(x: 0, y: 0, heading: 0)
        var grass = road
        for _ in 0..<(120 * 5) {
            stepCar(&road, input: InputState(throttle: 1, steer: 0, handbrake: false), dt: dt, surface: .asphalt)
            stepCar(&grass, input: InputState(throttle: 1, steer: 0, handbrake: false), dt: dt, surface: .grass)
        }
        XCTAssertLessThan(grass.speed, road.speed * 0.7)
    }

    func testLockShrinksWithSpeed() {
        XCTAssertEqual(steerLock(speed: 2), Vehicle.standard.maxSteer, accuracy: 1e-9)
        XCTAssertLessThan(steerLock(speed: 20), steerLock(speed: 10))
        XCTAssertGreaterThanOrEqual(steerLock(speed: 60), Vehicle.standard.minSteer)
    }

    func testCornerLiftRampsAboveCornerSpeed() {
        let r = 15.0
        let limit = cornerSpeed(radius: r)
        XCTAssertEqual(cornerLift(forwardSpeed: limit - 1, minRadius: r), 0)
        XCTAssertGreaterThan(cornerLift(forwardSpeed: limit + 1, minRadius: r), 0)
        XCTAssertEqual(cornerLift(forwardSpeed: limit + 10, minRadius: r), 1)
        XCTAssertGreaterThan(liftLookahead(forwardSpeed: 20), liftLookahead(forwardSpeed: 10))
    }
}
