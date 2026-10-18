import XCTest
@testable import Drifter

final class CourseTests: XCTestCase {
    let track = buildTrack(circuitDef)

    func testTrackIsAClosedLoopInMetres() {
        XCTAssertEqual(track.points.count, circuitDef.controls.count * circuitDef.samplesPerSegment)
        XCTAssertGreaterThan(track.length, 350)
        XCTAssertLessThan(track.length, 500)
        let tightest = track.points.map(\.radius).min() ?? 0
        XCTAssertGreaterThan(tightest, 6)
        XCTAssertEqual(track.rumbles.count, 2)
    }

    func testStartLineFacesUpTheStraight() {
        let p = startPose(track)
        XCTAssertEqual(p.heading, .pi / 2, accuracy: 0.05)
    }

    func testNearestOnTrackFindsTheCentreline() {
        let p = track.points[track.points.firstIndex { $0.radius > 200 } ?? 0]
        let q = nearestOnTrack(track, x: p.x, y: p.y)
        XCTAssertEqual(q.distance, 0, accuracy: 1e-6)
        XCTAssertEqual(q.s, p.s, accuracy: 1e-6)
        // Left normal offset lands at that distance
        let off = nearestOnTrack(track, x: p.x - p.ty * 5, y: p.y + p.tx * 5)
        XCTAssertEqual(off.distance, 5, accuracy: 0.2)
        XCTAssertFalse(isOffTrack(track, distance: 5))
        XCTAssertTrue(isOffTrack(track, distance: 7))
    }

    func testMinRadiusAheadLooksForward() {
        let straight = track.points.firstIndex { $0.radius > 200 } ?? 0
        XCTAssertLessThan(minRadiusAhead(track, index: straight, distance: 200), minRadiusAhead(track, index: straight, distance: 1))
    }

    func testLotContainsTheMiddleAndNotTheCorners() {
        let lot = Config.lot
        XCTAssertTrue(lot.contains(x: 0, y: 0))
        XCTAssertTrue(lot.contains(x: lot.width / 2 - 1, y: 0))
        XCTAssertFalse(lot.contains(x: lot.width / 2 - 1, y: lot.height / 2 - 1))
        XCTAssertFalse(lot.contains(x: lot.width / 2 + 1, y: 0))
    }

    func testLapsCountOnlyFullForwardLaps() {
        var laps = LapState()
        let length = track.length
        // Forward lap through the checkpoints
        for f in stride(from: 0.0, through: 0.99, by: 0.01) {
            updateLaps(&laps, s: f * length, trackLength: length, dt: 0.1)
        }
        updateLaps(&laps, s: 0.01 * length, trackLength: length, dt: 0.1)
        XCTAssertEqual(laps.laps, 1)
        XCTAssertNotNil(laps.bestLap)
        // Dithering across the line does not count
        updateLaps(&laps, s: 0.99 * length, trackLength: length, dt: 0.1)
        updateLaps(&laps, s: 0.01 * length, trackLength: length, dt: 0.1)
        XCTAssertEqual(laps.laps, 1)
    }
}
