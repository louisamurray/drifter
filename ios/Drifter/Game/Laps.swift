import Foundation

/// Lap counting via ordered checkpoints. A lap counts when the car crosses the
/// start line forwards having passed 25%, 50% and 75% of the track in order,
/// so dithering across the line or driving backwards never counts.
private let checkpoints: [Double] = [0.25, 0.5, 0.75]

struct LapState {
    var laps = 0
    /// Seconds elapsed in the current lap.
    var lapTime = 0.0
    var bestLap: Double? = nil
    var lastLap: Double? = nil
    var nextCheckpoint = 0
    var prevFraction = 0.0
}

func updateLaps(_ state: inout LapState, s: Double, trackLength: Double, dt: Double) {
    state.lapTime += dt
    let f = s / trackLength
    let prev = state.prevFraction
    state.prevFraction = f

    let crossedForward = prev > 0.8 && f < 0.2
    let crossedBackward = prev < 0.2 && f > 0.8

    if crossedForward {
        if state.nextCheckpoint == checkpoints.count {
            state.laps += 1
            state.lastLap = state.lapTime
            state.bestLap = state.bestLap.map { min($0, state.lapTime) } ?? state.lapTime
            state.lapTime = 0
        }
        state.nextCheckpoint = 0
        return
    }
    if crossedBackward {
        state.nextCheckpoint = 0
        return
    }

    if state.nextCheckpoint < checkpoints.count {
        let target = checkpoints[state.nextCheckpoint]
        if prev < target && f >= target {
            state.nextCheckpoint += 1
        }
    }
}
