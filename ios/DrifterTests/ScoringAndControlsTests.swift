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

    func testOneThumbZonesAreTheHalves() {
        XCTAssertEqual(zoneAt(x: 10, y: 10, width: 400, height: 800, scheme: .thumb, pad: pad), .left)
        XCTAssertEqual(zoneAt(x: 390, y: 790, width: 400, height: 800, scheme: .thumb, pad: pad), .right)
    }

    func testPedalZonesSitInTheBottomBand() {
        XCTAssertNil(zoneAt(x: 10, y: 10, width: 400, height: 800, scheme: .pedals, pad: pad))
        XCTAssertEqual(zoneAt(x: 30, y: 790, width: 400, height: 800, scheme: .pedals, pad: pad), .gas)
        XCTAssertEqual(zoneAt(x: 150, y: 790, width: 400, height: 800, scheme: .pedals, pad: pad), .brake)
        XCTAssertEqual(zoneAt(x: 350, y: 790, width: 400, height: 800, scheme: .pedals, pad: pad), .stick)
    }

    func testOneThumbSteersAndBrakesOnBoth() {
        let left = resolveControls(heldInOrder: [.left], scheme: .thumb)
        XCTAssertEqual(left.steer, 1)
        XCTAssertEqual(left.throttle, 1)
        let both = resolveControls(heldInOrder: [.right, .left], scheme: .thumb)
        XCTAssertEqual(both.steer, -1, "steer stays with the first side")
        XCTAssertTrue(both.handbrake)
        XCTAssertEqual(both.throttle, 0)
    }

    func testStickSteersTowardsItsHeading() {
        let r = resolveControls(heldInOrder: [.gas, .stick], scheme: .pedals, stick: .pi / 2 + 0.3, heading: .pi / 2, fullAngle: 0.6)
        XCTAssertTrue(r.analog)
        XCTAssertEqual(r.steer, 0.5, accuracy: 1e-9)
        XCTAssertEqual(r.throttle, 1)
        XCTAssertNil(stickHeading(dx: 1, dy: 1, radius: 70))
        XCTAssertEqual(stickHeading(dx: 0, dy: 50, radius: 70) ?? 0, .pi / 2, accuracy: 1e-9)
    }

    func testSteerRampHasTwoStagesAndAQuickRelease() {
        let ramp = Config.input.steer
        var s = 0.0
        for _ in 0..<18 { s = rampSteer(current: s, target: 1, dt: 1 / 60, ramp: ramp) }
        XCTAssertEqual(s, 0.5, accuracy: 0.02)
        for _ in 0..<30 { s = rampSteer(current: s, target: 1, dt: 1 / 60, ramp: ramp) }
        XCTAssertEqual(s, 1, accuracy: 1e-9)
        for _ in 0..<6 { s = rampSteer(current: s, target: 0, dt: 1 / 60, ramp: ramp) }
        XCTAssertEqual(s, 0, accuracy: 1e-9)
    }

    func testTouchControlsTrackPressOrder() {
        let c = TouchControls()
        c.scheme = .thumb
        c.screenWidth = 400
        c.screenHeight = 800
        let first = NSObject(), second = NSObject()
        let a = ObjectIdentifier(first), b = ObjectIdentifier(second)
        c.began(id: a, x: 300, y: 400)
        c.sample(dt: 1 / 60)
        XCTAssertTrue(c.held[.right] ?? false)
        c.began(id: b, x: 50, y: 400)
        let s = c.sample(dt: 1 / 60)
        XCTAssertTrue(s.handbrake)
        c.ended(id: a)
        c.ended(id: b)
        c.reset()
        XCTAssertEqual(c.state.steer, 0)
    }
}
