import Foundation

/// A pure-pursuit driver that follows the centreline on the stick, with the
/// automatic throttle and corner lift. Used for the title-screen ghost lap
/// and the drivability regression test.
func autopilot(track: Track, car: CarState, aggression: Double = 1) -> InputState {
    let q = nearestOnTrack(track, x: car.x, y: car.y)
    let n = track.points.count
    let ahead = Int((6 + car.speed * 0.55).rounded())
    let look = track.points[(q.index + ahead) % n]
    let want = atan2(look.y - car.y, look.x - car.x)
    let steer = clamp(angleDelta(car.heading, want) / 0.5, -1, 1)
    return InputState(throttle: aggression, steer: steer, handbrake: false)
}
