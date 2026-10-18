import SwiftUI
import SpriteKit

/// Bridges the scene and the run to SwiftUI: publishes only what the menus
/// show, so the game loop never touches the view hierarchy while playing.
final class GameViewModel: ObservableObject, GameSceneDelegate {
    let run: Run
    let scene: GameScene
    private let audio = AudioEngine()
    private let haptics = Haptics()

    @Published private(set) var state: GameState = .title
    @Published private(set) var mode: GameMode
    @Published private(set) var muted: Bool
    @Published private(set) var countdown = 3
    @Published private(set) var finalScore = 0.0
    @Published private(set) var finalBest = 0.0
    @Published private(set) var newBest = false
    @Published private(set) var bests: [GameMode: Double]

    init() {
        let run = Run()
        self.run = run
        scene = GameScene(run: run)
        mode = run.mode
        bests = run.bests
        muted = audio.muted
        scene.gameDelegate = self
    }

    // MARK: - Intents

    func start() {
        audio.start()
        run.startRun()
    }

    func pause() {
        run.pause()
    }

    func resume() {
        run.resume()
    }

    func restart() {
        run.restart()
    }

    func quitToTitle() {
        run.backToTitle()
    }

    func toggleMuted() {
        audio.setMuted(!audio.muted)
        muted = audio.muted
    }

    func setMode(_ next: GameMode) {
        run.setMode(next)
        mode = run.mode
    }

    func setOverviewBand(top: Double, bottom: Double) {
        run.overviewBandTop = top
        run.overviewBandBottom = bottom
    }

    func becameActive() {
        if run.state != .paused { audio.resume() }
        scene.isPaused = false
    }

    func leftForeground() {
        if run.state == .playing { run.pause() }
        audio.suspend()
        haptics.stopAll()
    }

    /// The game-over overview, with the run's rubber on it, through the share sheet.
    func share() {
        let where_ = mode == .track ? "in Drifter" : "in Drifter's open lot"
        let text = "I scored \(formatScore(finalScore)) \(where_). Can you beat it?"
        var items: [Any] = [text]
        if let image = scene.snapshot() { items.insert(image, at: 0) }
        let sheet = UIActivityViewController(activityItems: items, applicationActivities: nil)
        guard let windowScene = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }).first,
              let root = windowScene.keyWindow?.rootViewController else { return }
        var top = root
        while let presented = top.presentedViewController { top = presented }
        sheet.popoverPresentationController?.sourceView = top.view
        sheet.popoverPresentationController?.sourceRect = CGRect(x: top.view.bounds.midX, y: top.view.bounds.maxY - 80, width: 1, height: 1)
        top.present(sheet, animated: true)
    }

    // MARK: - GameSceneDelegate

    func scene(_ scene: GameScene, didRaise event: RunEvent) {
        switch event {
        case .stateChanged(let from, let to):
            state = to
            switch to {
            case .title:
                audio.stopEngineSound()
                haptics.stopAll()
                bests = run.bests
            case .countdown:
                audio.start()
                audio.startEngineSound()
                countdown = 3
            case .playing:
                if from == .paused { audio.resume() }
            case .paused:
                audio.suspend()
                haptics.stopAll()
            case .gameover:
                audio.stopEngineSound()
                haptics.stopAll()
                finalScore = run.score.score
                finalBest = run.best
                newBest = run.newBest
                bests = run.bests
            }
        case .haptic(let kind):
            haptics.play(kind)
        case .sfx(let sfx, let amount):
            audio.play(sfx, amount: amount)
        case .popup, .shake:
            break
        }
    }

    func sceneDidStep(_ scene: GameScene, audio t: AudioTelemetry) {
        audio.update(t)
        if run.state == .playing {
            haptics.setRumble(t.drifting && !t.offTrack ? t.slide : 0)
        }
    }

    func scene(_ scene: GameScene, countdown value: Int) {
        countdown = value
    }
}
