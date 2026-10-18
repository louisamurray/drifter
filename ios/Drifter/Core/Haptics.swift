import CoreHaptics
import UIKit

/// Taps for score events and a continuous rumble that follows the slide,
/// through Core Haptics where the hardware has it and plain feedback
/// generators everywhere else.
final class Haptics {
    private let light = UIImpactFeedbackGenerator(style: .light)
    private let medium = UIImpactFeedbackGenerator(style: .medium)
    private let heavy = UIImpactFeedbackGenerator(style: .heavy)
    private let selection = UISelectionFeedbackGenerator()
    private var engine: CHHapticEngine?
    private var rumble: CHHapticAdvancedPatternPlayer?
    private var rumbleLevel = 0.0
    private var rumbleOn = false
    private let supportsHaptics = CHHapticEngine.capabilitiesForHardware().supportsHaptics

    init() {
        light.prepare()
        medium.prepare()
        guard supportsHaptics else { return }
        do {
            let engine = try CHHapticEngine()
            engine.playsHapticsOnly = true
            engine.resetHandler = { [weak self] in
                self?.rumble = nil
                self?.rumbleOn = false
                try? self?.engine?.start()
            }
            engine.stoppedHandler = { [weak self] _ in
                self?.rumble = nil
                self?.rumbleOn = false
            }
            try engine.start()
            self.engine = engine
        } catch {
            engine = nil
        }
    }

    func play(_ kind: HapticKind) {
        switch kind {
        case .firstDrift: light.impactOccurred()
        case .multiplier: medium.impactOccurred(intensity: 0.8)
        case .bank: heavy.impactOccurred()
        case .tick: selection.selectionChanged()
        case .go: medium.impactOccurred()
        }
    }

    /// Continuous rumble at 0..1 intensity; zero stops it. Call once per frame.
    func setRumble(_ level: Double) {
        guard let engine else { return }
        let target = clamp(level, 0, 1)
        if target < 0.03 {
            if rumbleOn {
                try? rumble?.stop(atTime: CHHapticTimeImmediate)
                rumbleOn = false
            }
            rumbleLevel = 0
            return
        }
        if rumble == nil {
            let intensity = CHHapticEventParameter(parameterID: .hapticIntensity, value: 0.3)
            let sharpness = CHHapticEventParameter(parameterID: .hapticSharpness, value: 0.2)
            let event = CHHapticEvent(eventType: .hapticContinuous, parameters: [intensity, sharpness], relativeTime: 0, duration: 120)
            guard let pattern = try? CHHapticPattern(events: [event], parameters: []),
                  let player = try? engine.makeAdvancedPlayer(with: pattern) else { return }
            player.loopEnabled = true
            rumble = player
        }
        if !rumbleOn {
            try? engine.start()
            try? rumble?.start(atTime: CHHapticTimeImmediate)
            rumbleOn = true
        }
        if abs(target - rumbleLevel) > 0.04 {
            rumbleLevel = target
            let intensity = CHHapticDynamicParameter(parameterID: .hapticIntensityControl, value: Float(0.15 + 0.6 * target), relativeTime: 0)
            let sharpness = CHHapticDynamicParameter(parameterID: .hapticSharpnessControl, value: Float(0.1 + 0.4 * target), relativeTime: 0)
            try? rumble?.sendParameters([intensity, sharpness], atTime: CHHapticTimeImmediate)
        }
    }

    func stopAll() {
        setRumble(0)
    }
}
