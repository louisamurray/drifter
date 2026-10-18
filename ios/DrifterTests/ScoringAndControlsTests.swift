import XCTest
@testable import Drifter

final class ScoringTests: XCTestCase {
    private func drifting(_ hb: Bool = false) -> ScoreInput {
        ScoreInput(drifting: true, offTrack: false, slipAngle: 0.5, speed: 20, lapCompleted: false, handbrake: hb)
    }

    private let idle = ScoreInput(drifting: false, offTrack: false, slipAngle: 0, speed: 20, lapCompleted: false, handbrake: false)

    func testChainBanksAfterGrace() {
        var s = ScoreState()
        for _ in 0..<60 { updateScore(&s, input: drifting(), dt: 1 / 60) }
        XCTAssertGreaterThan(s.chain, 0)
        XCTAssertEqual(s.score, 0)
        for _ in 0..<70 { updateScore(&s, input: idle, dt: 1 / 60) }
        XCTAssertEqual(s.chain, 0)
        XCTAssertGreaterThan(s.score, 0)
        XCTAssertTrue(s.drainEvents().contains { if case .bank = $0 { return true } else { return false } })
    }

    func testMultiplierStepsAndCaps() {
        var s = ScoreState()
        for _ in 0..<(60 * 2 + 1) { updateScore(&s, input: drifting(), dt: 1 / 60) }
        XCTAssertEqual(s.multiplier, 1.5)
        for _ in 0..<(60 * 30) { updateScore(&s, input: drifting(), dt: 1 / 60) }
        XCTAssertEqual(s.multiplier, Config.scoring.multiplierMax)
        XCTAssertEqual(s.multiplierProgress, 1)
    }

    func testRunningWideKeepsHalf() {
        var s = ScoreState()
        for _ in 0..<60 { updateScore(&s, input: drifting(), dt: 1 / 60) }
        let chain = s.chain
        updateScore(&s, input: ScoreInput(drifting: true, offTrack: true, slipAngle: 0.5, speed: 20, lapCompleted: false, handbrake: false), dt: 1 / 60)
        XCTAssertEqual(s.score, chain * Config.scoring.offTrackKeep, accuracy: 1e-9)
        XCTAssertEqual(s.multiplier, 1)
    }

    func testHandbrakeScoresLess() {
        var a = ScoreState(), b = ScoreState()
        updateScore(&a, input: drifting(), dt: 1)
        updateScore(&b, input: drifting(true), dt: 1)
        XCTAssertEqual(b.chain, a.chain * Config.scoring.handbrakeScoreScale, accuracy: 1e-9)
    }

    func testTimerEndsTheRunAndBanks() {
        var s = ScoreState()
        updateScore(&s, input: drifting(), dt: Config.scoring.runSeconds - 0.5)
        XCTAssertFalse(s.finished)
        updateScore(&s, input: drifting(), dt: 1)
        XCTAssertTrue(s.finished)
        XCTAssertEqual(s.chain, 0)
        XCTAssertGreaterThan(s.score, 0)
    }

    func testFormatScoreGroupsThousands() {
        XCTAssertEqual(formatScore(999), "999")
        XCTAssertEqual(formatScore(12345.6), "12\u{2009}346")
    }
}

final class ControlsTests: XCTestCase {
    let pad = Config.input.pad

    func testZonesSitInTheBottomBand() {
        XCTAssertNil(zoneAt(x: 10, y: 10, width: 400, height: 800, pad: pad))
        XCTAssertEqual(zoneAt(x: 30, y: 790, width: 400, height: 800, pad: pad), .gas)
        XCTAssertEqual(zoneAt(x: 150, y: 790, width: 400, height: 800, pad: pad), .brake)
        XCTAssertEqual(zoneAt(x: 350, y: 790, width: 400, height: 800, pad: pad), .stick)
    }

    func testStickSteersTowardsItsHeading() {
        let r = resolveControls(held: [.gas, .stick], stick: .pi / 2 + 0.3, heading: .pi / 2, fullAngle: 0.6)
        XCTAssertEqual(r.steer, 0.5, accuracy: 1e-9)
        XCTAssertEqual(r.throttle, 1)
        XCTAssertFalse(r.handbrake)
        XCTAssertEqual(resolveControls(held: [.brake], stick: nil, heading: 0, fullAngle: 0.6).steer, 0)
        XCTAssertNil(stickHeading(dx: 1, dy: 1, radius: 70))
        XCTAssertEqual(stickHeading(dx: 0, dy: 50, radius: 70) ?? 0, .pi / 2, accuracy: 1e-9)
    }

    func testThrottleEasesInAndLetsGoAtOnce() {
        var s = InputState()
        advanceControls(&s, raw: RawControls(steer: 0, handbrake: false, throttle: 1), dt: 0.05, throttleSeconds: 0.15)
        XCTAssertEqual(s.throttle, 1.0 / 3.0, accuracy: 1e-9)
        advanceControls(&s, raw: RawControls(steer: 0, handbrake: false, throttle: 0), dt: 0.05, throttleSeconds: 0.15)
        XCTAssertEqual(s.throttle, 0)
    }

    func testTouchControlsMapThumbsToPedalsAndStick() {
        let c = TouchControls()
        c.screenWidth = 400
        c.screenHeight = 800
        c.carHeading = .pi / 2
        let first = NSObject(), second = NSObject()
        let a = ObjectIdentifier(first), b = ObjectIdentifier(second)
        c.began(id: a, x: 40, y: 760)
        c.sample(dt: 1)
        XCTAssertTrue(c.held[.gas] ?? false)
        XCTAssertEqual(c.state.throttle, 1)
        // A thumb up and left of the stick centre asks for a heading left of straight up
        let centre = c.stickCentre
        c.began(id: b, x: centre.x - 40, y: centre.y - 40)
        let s = c.sample(dt: 1 / 60)
        XCTAssertTrue(c.stickHeld)
        XCTAssertGreaterThan(s.steer, 0)
        XCTAssertLessThan(c.stickX, 0)
        XCTAssertGreaterThan(c.stickY, 0)
        c.ended(id: a)
        c.ended(id: b)
        c.reset()
        XCTAssertEqual(c.state.steer, 0)
        XCTAssertFalse(c.stickHeld)
    }
}
