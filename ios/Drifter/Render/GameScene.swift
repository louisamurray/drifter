import SpriteKit

/// Floating score text in screen space: rises, holds, then fades.
private final class Popup {
    let node = SKNode()
    let label = SKLabelNode(fontNamed: GameFont.name)
    let halo = SKShapeNode()
    var age = 0.0
    let life = 1.1
    let origin: CGPoint
    let size: CGFloat

    init(text: String, kind: PopupKind, origin: CGPoint) {
        self.origin = origin
        switch kind {
        case .bank:
            size = 34
            label.fontColor = Palette.hudText
        case .lost:
            size = 20
            label.fontColor = Palette.hudTextDim
        case .lap:
            size = 22
            label.fontColor = Palette.edgeLine
        case .multiplier:
            size = 26
            label.fontColor = Palette.accent
        }
        label.text = text
        label.fontSize = size
        label.verticalAlignmentMode = .center
        label.horizontalAlignmentMode = .center
        let w = label.frame.width + 18
        let h = size + 10
        halo.path = CGPath(roundedRect: CGRect(x: -w / 2, y: -h / 2, width: w, height: h), cornerWidth: h / 2, cornerHeight: h / 2, transform: nil)
        halo.fillColor = Palette.textHalo
        halo.strokeColor = .clear
        node.addChild(halo)
        node.addChild(label)
        node.zPosition = 90
    }

    func update(dt: Double) {
        age += dt
        let t = age / life
        let rise = 40 * min(1, t * 3)
        let alpha = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3
        let scale = t < 0.15 ? 1 + (0.15 - t) * 3 : 1
        node.position = CGPoint(x: origin.x, y: origin.y + rise)
        node.alpha = CGFloat(max(0, alpha))
        node.setScale(CGFloat(scale))
    }

    var dead: Bool { age >= life }
}

struct Shake {
    var amplitude = 0.0
    var timeLeft = 0.0
    var duration = 1.0
    var x = 0.0
    var y = 0.0

    mutating func trigger(amplitude a: Double, duration d: Double) {
        amplitude = max(amplitude, a)
        timeLeft = d
        duration = d
    }

    mutating func update(dt: Double) {
        if timeLeft <= 0 {
            x = 0
            y = 0
            amplitude = 0
            return
        }
        timeLeft -= dt
        let k = max(0, timeLeft / duration)
        let a = amplitude * k * k
        x = Double.random(in: -1...1) * a
        y = Double.random(in: -1...1) * a
    }
}

protocol GameSceneDelegate: AnyObject {
    func scene(_ scene: GameScene, didRaise event: RunEvent)
    func sceneDidStep(_ scene: GameScene, audio: AudioTelemetry)
    func scene(_ scene: GameScene, countdown: Int)
}

/// Draws the run and feeds it touches. Physics advances in fixed steps from
/// an accumulator, so the car behaves identically at 60 and 120 Hz; the car
/// is drawn at an interpolated pose between the last two steps.
final class GameScene: SKScene {
    let run: Run
    weak var gameDelegate: GameSceneDelegate?

    private let world = SKNode()
    private let grass = GrassNode()
    private var course: SKNode?
    private var courseMode: GameMode?
    private var skidLayers: [GameMode: SkidLayer] = [:]
    private var skids: SkidLayer
    private let smoke = SmokePool(capacity: Config.juice.smokeMax)
    private let carNode = CarNode()
    private let hud = HUDLayer()
    private let chainLabel = SKLabelNode(fontNamed: GameFont.name)
    private let chainHalo = SKShapeNode()
    private let chainNode = SKNode()
    private var popups: [Popup] = []
    private var shake = Shake()
    private var accumulator = 0.0
    private var lastTime: TimeInterval = 0
    private var lastCountdown = -1
    private var safe = UIEdgeInsets.zero

    init(run: Run) {
        self.run = run
        skids = SkidLayer()
        super.init(size: CGSize(width: 390, height: 844))
        scaleMode = .resizeFill
        anchorPoint = .zero
        backgroundColor = Palette.offTrack
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }

    override func didMove(to view: SKView) {
        view.isMultipleTouchEnabled = true
        view.ignoresSiblingOrder = true
        view.preferredFramesPerSecond = UIScreen.main.maximumFramesPerSecond
        view.showsFPS = false

        addChild(world)
        world.addChild(grass)
        world.addChild(smoke)
        world.addChild(carNode.shadow)
        carNode.zPosition = 10
        world.addChild(carNode)
        skids = skidLayer(for: run.mode)
        rebuildCourse()

        chainLabel.fontSize = 22
        chainLabel.verticalAlignmentMode = .center
        chainLabel.horizontalAlignmentMode = .center
        chainHalo.fillColor = Palette.textHalo
        chainHalo.strokeColor = .clear
        chainNode.addChild(chainHalo)
        chainNode.addChild(chainLabel)
        chainNode.zPosition = 80
        chainNode.isHidden = true
        addChild(chainNode)
        addChild(hud)
        hud.show(state: run.state)
        layout()
    }

    override func didChangeSize(_ oldSize: CGSize) {
        layout()
    }

    private func layout() {
        guard let view else { return }
        safe = view.safeAreaInsets
        let w = Double(size.width), h = Double(size.height)
        run.viewportWidth = w
        run.viewportHeight = h
        run.controls.screenWidth = w
        run.controls.screenHeight = h
        run.controls.safeRight = Double(safe.right)
        run.controls.safeBottom = Double(safe.bottom)
        hud.layout(width: w, height: h, safeTop: Double(safe.top), safeLeft: Double(safe.left), safeRight: Double(safe.right), safeBottom: Double(safe.bottom), pad: run.controls.pad)
    }

    private func skidLayer(for mode: GameMode) -> SkidLayer {
        if let layer = skidLayers[mode] { return layer }
        let layer = SkidLayer()
        skidLayers[mode] = layer
        return layer
    }

    private func rebuildCourse() {
        guard courseMode != run.mode else { return }
        courseMode = run.mode
        course?.removeFromParent()
        let node: SKNode = run.mode == .track ? TrackNode(track: run.track) : LotNode(lot: run.lot)
        node.zPosition = 0
        world.addChild(node)
        course = node
        skids.removeFromParent()
        skids = skidLayer(for: run.mode)
        world.addChild(skids)
    }

    // MARK: - Touches

    private func screenPoint(_ touch: UITouch) -> (Double, Double) {
        guard let view else { return (0, 0) }
        let p = touch.location(in: view)
        return (Double(p.x), Double(p.y))
    }

    override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent?) {
        guard run.state == .playing else { return }
        for t in touches {
            let (x, y) = screenPoint(t)
            run.controls.began(id: ObjectIdentifier(t), x: x, y: y)
        }
    }

    override func touchesMoved(_ touches: Set<UITouch>, with event: UIEvent?) {
        for t in touches {
            let (x, y) = screenPoint(t)
            run.controls.moved(id: ObjectIdentifier(t), x: x, y: y)
        }
    }

    override func touchesEnded(_ touches: Set<UITouch>, with event: UIEvent?) {
        for t in touches { run.controls.ended(id: ObjectIdentifier(t)) }
    }

    override func touchesCancelled(_ touches: Set<UITouch>, with event: UIEvent?) {
        for t in touches { run.controls.ended(id: ObjectIdentifier(t)) }
    }

    // MARK: - Loop

    override func update(_ currentTime: TimeInterval) {
        if lastTime == 0 { lastTime = currentTime }
        let frameDt = min(currentTime - lastTime, Config.loop.maxFrameDt)
        lastTime = currentTime
        if run.state == .paused {
            accumulator = 0
        } else {
            accumulator += frameDt
            let step = Config.loop.fixedDt
            var steps = 0
            while accumulator >= step && steps < 8 {
                run.update(dt: step)
                afterStep(dt: step)
                accumulator -= step
                steps += 1
            }
            if accumulator >= step { accumulator = 0 }
        }
        skids.flush()
        for e in run.drainEvents() { handle(e) }
        if run.state == .countdown {
            let n = Int(run.countdownLeft.rounded(.up))
            if n != lastCountdown {
                lastCountdown = n
                gameDelegate?.scene(self, countdown: n)
            }
        }
        smoke.update(dt: frameDt)
        shake.update(dt: frameDt)
        for p in popups { p.update(dt: frameDt) }
        popups.removeAll { p in
            if p.dead { p.node.removeFromParent() }
            return p.dead
        }
        render(alpha: accumulator / Config.loop.fixedDt, dt: frameDt)
    }

    /// Rubber and smoke from the rear wheels, and sound, after every physics step.
    private func afterStep(dt: Double) {
        let car = run.car
        let intensity = run.slideIntensity
        if intensity > 0 {
            let now = rearWheels(x: car.x, y: car.y, heading: car.heading)
            let before = rearWheels(x: run.prev.x, y: run.prev.y, heading: run.prev.heading)
            skids.mark(x0: before.lx, y0: before.ly, x1: now.lx, y1: now.ly, intensity: intensity)
            skids.mark(x0: before.rx, y0: before.ry, x1: now.rx, y1: now.ry, intensity: intensity)
            let heat = min(1, abs(car.slipAngle) / 0.8)
            let rate = Config.juice.smokeRate * intensity
            let v = car.worldVelocity
            smoke.emit(x: now.lx, y: now.ly, vx: v.x, vy: v.y, rate: rate, dt: dt, heat: heat)
            smoke.emit(x: now.rx, y: now.ry, vx: v.x, vy: v.y, rate: rate, dt: dt, heat: heat)
        }
        gameDelegate?.sceneDidStep(self, audio: run.audio)
    }

    private func handle(_ e: RunEvent) {
        switch e {
        case .popup(let text, let kind):
            let cx = Double(size.width) / 2
            let cy = Double(size.height) * (1 - Config.render.carScreenY)
            let origin: CGPoint
            switch kind {
            case .multiplier: origin = CGPoint(x: cx + 70, y: cy + 40)
            case .lap: origin = CGPoint(x: cx, y: cy + 110)
            default: origin = CGPoint(x: cx, y: cy + 70)
            }
            let p = Popup(text: text, kind: kind, origin: origin)
            addChild(p.node)
            popups.append(p)
        case .shake(let amplitude, let duration):
            shake.trigger(amplitude: amplitude, duration: duration)
        case .stateChanged(_, let to):
            hud.show(state: to)
            if to == .title || to == .countdown {
                skids.clear()
                smoke.clear()
                for p in popups { p.node.removeFromParent() }
                popups.removeAll()
                lastCountdown = -1
            }
            rebuildCourse()
        case .haptic, .sfx:
            break
        }
        gameDelegate?.scene(self, didRaise: e)
    }

    private func lerpAngle(_ a: Double, _ b: Double, _ t: Double) -> Double {
        a + angleDelta(a, b) * t
    }

    private func render(alpha: Double, dt: Double) {
        let cam = run.camera
        let zoom = cam.zoom
        let w = Double(size.width), h = Double(size.height)
        let anchorX = w / 2 + shake.x
        let anchorY = h * (1 - Config.render.carScreenY) + shake.y
        world.setScale(CGFloat(zoom))
        world.position = CGPoint(x: anchorX - cam.x * zoom, y: anchorY - cam.y * zoom)

        let margin = 3.0
        grass.cover(
            minX: cam.x - anchorX / zoom - margin,
            minY: cam.y - anchorY / zoom - margin,
            maxX: cam.x + (w - anchorX) / zoom + margin,
            maxY: cam.y + (h - anchorY) / zoom + margin
        )

        let car = run.car, prev = run.prev
        let t = clamp(alpha, 0, 1)
        let x = prev.x + (car.x - prev.x) * t
        let y = prev.y + (car.y - prev.y) * t
        let heading = lerpAngle(prev.heading, car.heading, t)
        carNode.place(x: x, y: y, heading: heading)
        carNode.apply(look: run.look)
        smoke.render()

        if run.state == .playing {
            let sx = anchorX + (x - cam.x) * zoom
            let sy = anchorY + (y - cam.y) * zoom
            let chain = run.score.chain
            if chain > 0 {
                chainNode.isHidden = false
                chainNode.position = CGPoint(x: sx, y: sy + 44)
                let fontSize = 22 + min(18, log10(chain + 1) * 6)
                chainLabel.fontSize = CGFloat(fontSize)
                chainLabel.text = "+\(Int(chain.rounded()))"
                chainLabel.fontColor = run.score.multiplier > 1 ? Palette.accent : Palette.hudText
                let lw = chainLabel.frame.width + 14
                let lh = CGFloat(fontSize) + 8
                chainHalo.path = CGPath(roundedRect: CGRect(x: -lw / 2, y: -lh / 2, width: lw, height: lh), cornerWidth: lh / 2, cornerHeight: lh / 2, transform: nil)
            } else {
                chainNode.isHidden = true
            }
            hud.setPlaying(score: run.score.score, timeLeft: run.score.timeLeft, runSeconds: Config.scoring.runSeconds, multiplier: run.score.multiplier, progress: run.score.multiplierProgress)
            hud.setPad(controls: run.controls, scheme: run.scheme)
            hud.setZones(learning: run.learning, scheme: run.scheme, controls: run.controls)
            hud.setOffRoad(run.offTrack, dt: dt)
        } else {
            chainNode.isHidden = true
        }
    }

    /// The current frame as an image, for sharing the rubber drawing.
    func snapshot() -> UIImage? {
        guard let view, let texture = view.texture(from: self) else { return nil }
        return UIImage(cgImage: texture.cgImage())
    }
}
