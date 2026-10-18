import Foundation

/// Where a run takes place. `track` is the circuit: a road to follow, laps to
/// count, grass beyond the edge line. `free` is the open lot.
enum GameMode: String, CaseIterable {
    case track
    case free

    var title: String {
        switch self {
        case .track: return "Circuit"
        case .free: return "Free drift"
        }
    }
}

enum GameState {
    case title, countdown, playing, paused, gameover
}

/// Best scores and remembered settings in UserDefaults. The keys match the web game's.
enum Storage {
    private static let defaults = UserDefaults.standard

    private static func bestKey(_ mode: GameMode) -> String {
        mode == .track ? "drifter.best" : "drifter.best.\(mode.rawValue)"
    }

    static func loadBest(_ mode: GameMode) -> Double {
        let v = defaults.double(forKey: bestKey(mode))
        return v.isFinite && v > 0 ? v : 0
    }

    static func saveBest(_ mode: GameMode, _ score: Double) {
        defaults.set(score.rounded(), forKey: bestKey(mode))
    }

    static func loadMode() -> GameMode {
        GameMode(rawValue: defaults.string(forKey: "drifter.mode") ?? "") ?? .track
    }

    static func saveMode(_ mode: GameMode) {
        defaults.set(mode.rawValue, forKey: "drifter.mode")
    }

    static func loadMuted() -> Bool {
        defaults.bool(forKey: "drifter.muted")
    }

    static func saveMuted(_ muted: Bool) {
        defaults.set(muted, forKey: "drifter.muted")
    }
}
