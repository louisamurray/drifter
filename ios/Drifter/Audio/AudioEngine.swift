import AVFoundation
import Foundation

/// Procedural audio, nothing bundled. The engine is detuned oscillators
/// through a low-pass, the squeal is band-passed noise plus a vibrato tone,
/// and the effects are short enveloped blips. All of it is synthesised in one
/// source-node render block, so the whole soundtrack is a few kilobytes of code.
final class AudioEngine {
    private let engine = AVAudioEngine()
    private var source: AVAudioSourceNode?
    private let synth = Synth()
    // Session activation and engine operations can block. Keep them off the UI
    // thread and on one queue so a pause requested during startup runs after it.
    private let lifecycleQueue = DispatchQueue(label: "com.whiringa.drifter.audio", qos: .userInitiated)
    private let activateSession: () throws -> Void
    private var running = false // lifecycleQueue only
    private(set) var muted: Bool {
        didSet { Storage.saveMuted(muted) }
    }

    init(activateSession: @escaping () throws -> Void = {
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.ambient, mode: .default, options: [.mixWithOthers])
        try session.setActive(true)
    }) {
        self.activateSession = activateSession
        muted = Storage.loadMuted()
        synth.masterTarget = muted ? 0 : 1
    }

    func setMuted(_ value: Bool) {
        muted = value
        synth.masterTarget = value ? 0 : 1
        if !value { start() }
    }

    /// Schedule graph/session startup without blocking the caller. Safe to call repeatedly.
    func start() {
        lifecycleQueue.async { self.startOnAudioQueue() }
    }

    private func startOnAudioQueue() {
        dispatchPrecondition(condition: .onQueue(lifecycleQueue))
        guard !running else { return }
        do {
            try activateSession()
        } catch {
            return
        }
        let sampleRate = engine.outputNode.outputFormat(forBus: 0).sampleRate
        synth.sampleRate = sampleRate > 0 ? sampleRate : 44100
        let format = AVAudioFormat(standardFormatWithSampleRate: synth.sampleRate, channels: 1)!
        let synth = self.synth
        let node = AVAudioSourceNode(format: format) { _, _, frameCount, audioBufferList -> OSStatus in
            let buffers = UnsafeMutableAudioBufferListPointer(audioBufferList)
            guard let out = buffers[0].mData?.assumingMemoryBound(to: Float.self) else { return noErr }
            synth.render(into: out, frames: Int(frameCount))
            return noErr
        }
        engine.attach(node)
        engine.connect(node, to: engine.mainMixerNode, format: format)
        engine.mainMixerNode.outputVolume = 0.8
        do {
            try engine.start()
            source = node
            running = true
        } catch {
            engine.detach(node)
        }
    }

    func suspend() {
        lifecycleQueue.async {
            guard self.running else { return }
            self.engine.pause()
        }
    }

    func resume() {
        lifecycleQueue.async {
            guard self.running else { return }
            if !self.engine.isRunning { try? self.engine.start() }
        }
    }

    func startEngineSound() {
        synth.engineOn = true
    }

    func stopEngineSound() {
        synth.engineOn = false
    }

    func update(_ t: AudioTelemetry) {
        synth.update(t)
    }

    func play(_ sfx: Sfx, amount: Double) {
        synth.play(sfx, amount: amount)
    }
}

/// Pure mappings from telemetry to audio parameters, like the web game's.
enum AudioMapping {
    static let engineIdleHz = 58.0
    static let engineTopHz = 215.0

    static func engineFrequency(speedRatio: Double, drifting: Bool, handbrake: Bool, wheelspin: Double) -> Double {
        let r = clamp(speedRatio, 0, 1)
        var f = engineIdleHz + (engineTopHz - engineIdleHz) * pow(r, 0.85)
        if drifting { f *= 1.12 }
        if handbrake { f *= 0.94 }
        f *= 1 + 0.25 * wheelspin
        return f
    }

    static func engineGain(speedRatio: Double, throttle: Double) -> Double {
        let r = clamp(speedRatio, 0, 1)
        return 0.1 + 0.05 * r + 0.08 * throttle
    }

    static func engineCutoff(speedRatio: Double) -> Double {
        500 + 2200 * clamp(speedRatio, 0, 1)
    }

    static func squealGain(slide: Double, offTrack: Bool) -> Double {
        if offTrack { return 0 }
        return 0.26 * pow(clamp(slide, 0, 1), 1.6)
    }

    static func squealFrequency(slide: Double) -> Double {
        1500 + 700 * clamp(slide, 0, 1)
    }

    /// Bank chime root in Hz: rises by a fourth per decade of banked points, capped.
    static func bankRootHz(amount: Double) -> Double {
        let decades = clamp(log10(max(1, amount)) - 1, 0, 3)
        return 392 * pow(4.0 / 3.0, decades)
    }
}

/// A two-pole band-pass, direct form I.
private struct Bandpass {
    var b0 = 0.0, b1 = 0.0, b2 = 0.0, a1 = 0.0, a2 = 0.0
    var x1 = 0.0, x2 = 0.0, y1 = 0.0, y2 = 0.0

    mutating func set(frequency: Double, q: Double, sampleRate: Double) {
        let w0 = 2 * Double.pi * frequency / sampleRate
        let alpha = sin(w0) / (2 * q)
        let a0 = 1 + alpha
        b0 = alpha / a0
        b1 = 0
        b2 = -alpha / a0
        a1 = -2 * cos(w0) / a0
        a2 = (1 - alpha) / a0
    }

    mutating func process(_ x: Double) -> Double {
        let y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2
        x2 = x1
        x1 = x
        y2 = y1
        y1 = y
        return y
    }
}

private enum Wave {
    case sine, triangle, sawtooth
}

private struct Voice {
    var frequency: Double
    var wave: Wave
    var peak: Double
    var duration: Double
    var delay: Double
    var lowpass: Double
    var age = 0.0
    var phase = 0.0
    var lp = 0.0
}

/// The DSP. Parameters are written from the game thread and read in the
/// render block; each is smoothed per sample, so a torn read is inaudible.
private final class Synth {
    var sampleRate = 44100.0
    var engineOn = false
    var masterTarget = 1.0

    // Targets from telemetry
    private var freqTarget = AudioMapping.engineIdleHz
    private var cutoffTarget = 600.0
    private var engineGainTarget = 0.0
    private var squealGainTarget = 0.0
    private var squealFreqTarget = 1500.0

    // Smoothed state, audio thread only
    private var master = 1.0
    private var freq = AudioMapping.engineIdleHz
    private var cutoff = 600.0
    private var engineGain = 0.0
    private var squealGain = 0.0
    private var squealFreq = 1500.0
    private var phase0 = 0.0, phase1 = 0.0, phase2 = 0.0
    private var lp = 0.0
    private var bandpass = Bandpass()
    private var bandpassFreq = 0.0
    private var tonePhase = 0.0
    private var vibratoPhase = 0.0
    private var noiseState: UInt32 = 0x1234567
    private var voices: [Voice] = []
    private let voiceLock = NSLock()
    private var pendingVoices: [Voice] = []

    func update(_ t: AudioTelemetry) {
        freqTarget = AudioMapping.engineFrequency(speedRatio: t.speedRatio, drifting: t.drifting, handbrake: t.handbrake, wheelspin: t.wheelspin)
        cutoffTarget = AudioMapping.engineCutoff(speedRatio: t.speedRatio)
        engineGainTarget = AudioMapping.engineGain(speedRatio: t.speedRatio, throttle: t.throttle)
        squealGainTarget = AudioMapping.squealGain(slide: t.slide, offTrack: t.offTrack)
        squealFreqTarget = AudioMapping.squealFrequency(slide: t.slide)
    }

    func play(_ sfx: Sfx, amount: Double) {
        var list: [Voice] = []
        func blip(_ f: Double, _ delay: Double, _ duration: Double, _ peak: Double, _ wave: Wave, lowpass: Double = 0) {
            list.append(Voice(frequency: f, wave: wave, peak: peak, duration: duration, delay: delay, lowpass: lowpass))
        }
        switch sfx {
        case .tick:
            blip(880, 0, 0.06, 0.22, .sine)
        case .go:
            blip(1320, 0, 0.22, 0.26, .sine)
        case .multiplier:
            blip(660, 0, 0.07, 0.2, .triangle)
            blip(990, 0.07, 0.09, 0.2, .triangle)
        case .bank:
            let root = AudioMapping.bankRootHz(amount: amount)
            blip(root, 0, 0.08, 0.22, .triangle)
            blip(root * 1.25, 0.06, 0.08, 0.2, .triangle)
            blip(root * 1.5, 0.12, 0.16, 0.18, .triangle)
        case .wide:
            blip(130, 0, 0.14, 0.18, .sawtooth, lowpass: 500)
        }
        voiceLock.lock()
        pendingVoices.append(contentsOf: list)
        voiceLock.unlock()
    }

    private func noise() -> Double {
        noiseState = noiseState &* 1664525 &+ 1013904223
        return Double(noiseState >> 8) / Double(1 << 24) * 2 - 1
    }

    @inline(__always)
    private func wave(_ w: Wave, _ phase: Double) -> Double {
        switch w {
        case .sine: return sin(phase * 2 * .pi)
        case .triangle: return 4 * abs(phase - 0.5) - 1
        case .sawtooth: return phase * 2 - 1
        }
    }

    func render(into out: UnsafeMutablePointer<Float>, frames: Int) {
        if voiceLock.try() {
            if !pendingVoices.isEmpty {
                voices.append(contentsOf: pendingVoices)
                pendingVoices.removeAll()
                if voices.count > 12 { voices.removeFirst(voices.count - 12) }
            }
            voiceLock.unlock()
        }
        let sr = sampleRate
        let dt = 1 / sr
        let smooth = 1 - exp(-dt / 0.06)
        let fast = 1 - exp(-dt / 0.02)
        let gainTarget = engineOn ? engineGainTarget : 0
        let sqTarget = engineOn ? squealGainTarget : 0

        for i in 0..<frames {
            master += (masterTarget - master) * fast
            freq += (freqTarget - freq) * smooth
            cutoff += (cutoffTarget - cutoff) * smooth
            engineGain += (gainTarget - engineGain) * smooth
            squealGain += (sqTarget - squealGain) * fast
            squealFreq += (squealFreqTarget - squealFreq) * smooth

            // Engine: saw + sub square + detuned saw, low-passed
            phase0 += freq * dt
            phase1 += freq * 0.5 * dt
            phase2 += freq * 1.007 * dt
            if phase0 >= 1 { phase0 -= 1 }
            if phase1 >= 1 { phase1 -= 1 }
            if phase2 >= 1 { phase2 -= 1 }
            let saw0 = phase0 * 2 - 1
            let square = phase1 < 0.5 ? 1.0 : -1.0
            let saw2 = phase2 * 2 - 1
            let raw = saw0 * 0.5 + square * 0.35 + saw2 * 0.3
            let k = 1 - exp(-2 * .pi * cutoff * dt)
            lp += (raw - lp) * k
            var sample = lp * engineGain

            // Squeal: band-passed noise plus a vibrato tone
            if squealGain > 0.001 {
                if abs(squealFreq - bandpassFreq) > 5 {
                    bandpassFreq = squealFreq
                    bandpass.set(frequency: squealFreq, q: 9, sampleRate: sr)
                }
                let n = bandpass.process(noise()) * 3
                vibratoPhase += 7 * dt
                if vibratoPhase >= 1 { vibratoPhase -= 1 }
                let toneFreq = squealFreq * 0.8 + 24 * sin(vibratoPhase * 2 * .pi)
                tonePhase += toneFreq * dt
                if tonePhase >= 1 { tonePhase -= 1 }
                sample += (n + 0.35 * sin(tonePhase * 2 * .pi)) * squealGain
            }

            // Blips
            if !voices.isEmpty {
                for v in voices.indices {
                    voices[v].age += dt
                    let t = voices[v].age - voices[v].delay
                    guard t >= 0 else { continue }
                    let env: Double
                    if t < 0.008 {
                        env = voices[v].peak * (t / 0.008)
                    } else {
                        let tail = max(0, 1 - (t - 0.008) / max(0.001, voices[v].duration - 0.008))
                        env = voices[v].peak * tail * tail
                    }
                    voices[v].phase += voices[v].frequency * dt
                    if voices[v].phase >= 1 { voices[v].phase -= 1 }
                    var s = wave(voices[v].wave, voices[v].phase)
                    if voices[v].lowpass > 0 {
                        let kk = 1 - exp(-2 * .pi * voices[v].lowpass * dt)
                        voices[v].lp += (s - voices[v].lp) * kk
                        s = voices[v].lp
                    }
                    sample += s * env
                }
                if i == frames - 1 {
                    voices.removeAll { $0.age >= $0.delay + $0.duration + 0.02 }
                }
            }

            out[i] = Float(max(-1, min(1, sample * master)))
        }
    }
}
