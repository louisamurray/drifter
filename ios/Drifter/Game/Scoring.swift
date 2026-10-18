import Foundation

enum ScoreEvent: Equatable {
    case multiplier(Double)
    case bank(Double)
    case lost(amount: Double, kept: Double)
    case lap(bonus: Double)
}

struct ScoreState {
    var score = 0.0
    /// Unbanked points in the current chain.
    var chain = 0.0
    /// Seconds of continuous drifting in the current chain.
    var chainTime = 0.0
    var multiplier = 1.0
    /// Seconds since the car was last drifting.
    var grace = 0.0
    var timeLeft = Config.scoring.runSeconds
    var finished = false
    var events: [ScoreEvent] = []

    /// 0..1 progress towards the next multiplier step, 1 when capped.
    var multiplierProgress: Double {
        if multiplier >= Config.scoring.multiplierMax { return 1 }
        if chain == 0 { return 0 }
        return chainTime.truncatingRemainder(dividingBy: Config.scoring.multiplierEvery) / Config.scoring.multiplierEvery
    }

    mutating func drainEvents() -> [ScoreEvent] {
        let out = events
        events = []
        return out
    }
}

struct ScoreInput {
    var drifting: Bool
    var offTrack: Bool
    /// Signed body slip angle in radians.
    var slipAngle: Double
    var speed: Double
    /// True on the step a lap was completed.
    var lapCompleted: Bool
    var handbrake: Bool
}

private func bank(_ s: inout ScoreState) {
    if s.chain > 0 {
        s.score += s.chain
        s.events.append(.bank(s.chain))
    }
    resetChain(&s)
}

private func resetChain(_ s: inout ScoreState) {
    s.chain = 0
    s.chainTime = 0
    s.multiplier = 1
    s.grace = 0
}

/// Advance scoring by one physics step. Events accumulate until drained.
func updateScore(_ s: inout ScoreState, input: ScoreInput, dt: Double) {
    if s.finished { return }
    typealias C = Config.scoring

    s.timeLeft -= dt
    if s.timeLeft <= 0 {
        s.timeLeft = 0
        bank(&s)
        s.finished = true
        return
    }

    if input.lapCompleted {
        s.score += C.lapBonus
        s.events.append(.lap(bonus: C.lapBonus))
    }

    if input.offTrack {
        // Running wide ends the chain: part of it banks, the rest is lost with the multiplier
        if s.chain > 0 {
            let kept = s.chain * C.offTrackKeep
            s.score += kept
            s.events.append(.lost(amount: s.chain - kept, kept: kept))
        }
        resetChain(&s)
        return
    }

    if input.drifting {
        s.grace = 0
        s.chainTime += dt
        let steps = (s.chainTime / C.multiplierEvery).rounded(.down)
        let next = min(C.multiplierMax, 1 + steps * C.multiplierStep)
        if next > s.multiplier {
            s.multiplier = next
            s.events.append(.multiplier(next))
        }
        let rate = C.pointsScale * (input.handbrake ? C.handbrakeScoreScale : 1)
        s.chain += rate * abs(input.slipAngle) * input.speed * dt * s.multiplier
        return
    }

    if s.chain > 0 {
        s.grace += dt
        if s.grace >= C.graceSeconds { bank(&s) }
    }
}

/// Thousands separated with thin spaces, like the web game.
func formatScore(_ value: Double) -> String {
    let n = Int(value.rounded())
    let formatter = NumberFormatter()
    formatter.numberStyle = .decimal
    formatter.groupingSeparator = "\u{2009}"
    formatter.usesGroupingSeparator = true
    return formatter.string(from: NSNumber(value: n)) ?? String(n)
}
