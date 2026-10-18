import SpriteKit

/// The in-game overlay, drawn in the scene so it updates every frame without
/// touching SwiftUI: score, timer and its bar, the multiplier ring, the
/// pedals and stick, hold cues for new players, and the off-road vignette.
/// Screen coordinates, y up, origin bottom-left.
final class HUDLayer: SKNode {
    private let scoreLabel = SKLabelNode(fontNamed: GameFont.name)
    private let scoreCaption = SKLabelNode(fontNamed: GameFont.name)
    private let timerLabel = SKLabelNode(fontNamed: GameFont.name)
    private let timebar = SKSpriteNode(color: Palette.accent, size: CGSize(width: 1, height: 3))
    private let timebarTrack = SKSpriteNode(color: UIColor(white: 1, alpha: 0.12), size: CGSize(width: 1, height: 3))
    private let multLabel = SKLabelNode(fontNamed: GameFont.name)
    private let ringTrack = SKShapeNode(circleOfRadius: 19)
    private let ringFill = SKShapeNode()
    private var lastRingProgress = -1.0
    private let gas = SKShapeNode(circleOfRadius: 40)
    private let brake = SKShapeNode(circleOfRadius: 40)
    private let gasLabel = SKLabelNode(fontNamed: GameFont.name)
    private let brakeLabel = SKLabelNode(fontNamed: GameFont.name)
    private let stickBase = SKShapeNode(circleOfRadius: 70)
    private let stickKnob = SKShapeNode(circleOfRadius: 26)
    private let vignette = SKSpriteNode()
    private var vignetteSize = CGSize.zero
    private let playing = SKNode()

    private var width = 390.0
    private var height = 844.0
    private var safeTop = 0.0
    private var safeBottom = 0.0
    private var safeLeft = 0.0
    private var safeRight = 0.0

    override init() {
        super.init()
        zPosition = 100
        addChild(playing)

        func caption(_ l: SKLabelNode, size: CGFloat, color: UIColor = Palette.hudText) {
            l.fontSize = size
            l.fontColor = color
            l.verticalAlignmentMode = .top
        }
        caption(scoreCaption, size: 10, color: Palette.hudTextDim)
        scoreCaption.text = "SCORE"
        scoreCaption.horizontalAlignmentMode = .left
        caption(scoreLabel, size: 26)
        scoreLabel.horizontalAlignmentMode = .left
        scoreLabel.text = "0"
        caption(timerLabel, size: 26)
        timerLabel.horizontalAlignmentMode = .right
        timerLabel.text = "60.0"
        for n in [scoreCaption, scoreLabel, timerLabel] { playing.addChild(n) }

        timebarTrack.anchorPoint = CGPoint(x: 0, y: 1)
        timebar.anchorPoint = CGPoint(x: 0, y: 1)
        playing.addChild(timebarTrack)
        playing.addChild(timebar)

        ringTrack.strokeColor = UIColor(white: 1, alpha: 0.15)
        ringTrack.lineWidth = 4
        ringTrack.fillColor = .clear
        ringFill.strokeColor = Palette.accent
        ringFill.lineWidth = 4
        ringFill.fillColor = .clear
        ringFill.lineCap = .round
        multLabel.fontSize = 13
        multLabel.fontColor = Palette.hudText
        multLabel.verticalAlignmentMode = .center
        multLabel.horizontalAlignmentMode = .center
        multLabel.text = "×1"
        for n in [ringTrack, ringFill, multLabel] { playing.addChild(n) }

        for (pedal, label, text) in [(gas, gasLabel, "GAS"), (brake, brakeLabel, "BRAKE")] {
            pedal.fillColor = Palette.padFill
            pedal.strokeColor = Palette.padStroke
            pedal.lineWidth = 2
            label.fontSize = 10
            label.fontColor = Palette.hudTextDim
            label.verticalAlignmentMode = .center
            label.horizontalAlignmentMode = .center
            label.text = text
            pedal.addChild(label)
            playing.addChild(pedal)
        }
        stickBase.fillColor = Palette.padFill
        stickBase.strokeColor = Palette.padStroke
        stickBase.lineWidth = 2
        stickKnob.fillColor = UIColor(hex: 0xf2eee6, alpha: 0.5)
        stickKnob.strokeColor = .clear
        stickBase.addChild(stickKnob)
        playing.addChild(stickBase)

        vignette.alpha = 0
        vignette.zPosition = -1
        playing.addChild(vignette)
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }

    func layout(width: Double, height: Double, safeTop: Double, safeLeft: Double, safeRight: Double, safeBottom: Double, pad: PadLayout) {
        self.width = width
        self.height = height
        self.safeTop = safeTop
        self.safeBottom = safeBottom
        self.safeLeft = safeLeft
        self.safeRight = safeRight
        let top = height - safeTop
        timebarTrack.position = CGPoint(x: 0, y: top)
        timebarTrack.size = CGSize(width: width, height: 3)
        timebar.position = CGPoint(x: 0, y: top)
        scoreCaption.position = CGPoint(x: safeLeft + 16, y: top - 14)
        scoreLabel.position = CGPoint(x: safeLeft + 16, y: top - 26)
        timerLabel.position = CGPoint(x: width - safeRight - 16, y: top - 22)
        let ringX = width - safeRight - 16 - 22
        let ringY = top - 60 - 22
        ringTrack.position = CGPoint(x: ringX, y: ringY)
        ringFill.position = ringTrack.position
        multLabel.position = ringTrack.position

        let r = pad.pedalSize / 2
        let py = safeBottom + pad.inset + r
        let gx = safeLeft + pad.inset + r
        gas.position = CGPoint(x: gx, y: py)
        brake.position = CGPoint(x: gx + pad.pedalSize + pad.pedalGap, y: py)
        let sr = pad.inset + pad.stickRadius
        stickBase.position = CGPoint(x: width - safeRight - sr, y: safeBottom + sr)

        let size = CGSize(width: width, height: height)
        if size != vignetteSize {
            vignetteSize = size
            vignette.texture = HUDLayer.makeVignette(size: size)
            vignette.size = size
            vignette.position = CGPoint(x: width / 2, y: height / 2)
        }
    }

    private static func makeVignette(size: CGSize) -> SKTexture {
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        format.opaque = false
        let scale: CGFloat = 0.25
        let small = CGSize(width: max(1, size.width * scale), height: max(1, size.height * scale))
        let renderer = UIGraphicsImageRenderer(size: small, format: format)
        let image = renderer.image { ctx in
            let colors = [UIColor(hex: 0xff5a2d, alpha: 0).cgColor, UIColor(hex: 0xff5a2d, alpha: 0.55).cgColor] as CFArray
            let gradient = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: colors, locations: [0.55, 1])!
            let centre = CGPoint(x: small.width / 2, y: small.height / 2)
            let radius = max(small.width, small.height) * 0.7
            ctx.cgContext.drawRadialGradient(gradient, startCenter: centre, startRadius: 0, endCenter: centre, endRadius: radius, options: [.drawsAfterEndLocation])
        }
        return SKTexture(image: image)
    }

    func show(state: GameState) {
        playing.isHidden = state != .playing
    }

    func setPlaying(score: Double, timeLeft: Double, runSeconds: Double, multiplier: Double, progress: Double) {
        scoreLabel.text = formatScore(score)
        timerLabel.text = String(format: "%.1f", timeLeft)
        timerLabel.fontColor = timeLeft <= 10 ? Palette.accent : Palette.hudText
        timebar.size = CGSize(width: width * CGFloat(timeLeft / runSeconds), height: 3)
        multLabel.text = multiplier == multiplier.rounded() ? "×\(Int(multiplier))" : "×\(multiplier)"
        multLabel.fontColor = multiplier > 1 ? Palette.accent : Palette.hudText
        let q = (progress * 40).rounded() / 40
        if q != lastRingProgress {
            lastRingProgress = q
            if q <= 0 {
                ringFill.path = nil
            } else {
                let path = CGMutablePath()
                path.addArc(center: .zero, radius: 19, startAngle: .pi / 2, endAngle: .pi / 2 - CGFloat(q) * 2 * .pi, clockwise: true)
                ringFill.path = path
            }
        }
    }

    /// Pedals and stick, lit while held, with the knob following the thumb. A
    /// new player gets the labels until their first lap or banked chain.
    func setPad(controls: TouchControls, learning: Bool) {
        gasLabel.alpha = learning ? 1 : 0.35
        brakeLabel.alpha = learning ? 1 : 0.35
        gas.fillColor = controls.held[.gas] == true ? Palette.padHeld : Palette.padFill
        brake.fillColor = controls.held[.brake] == true ? Palette.padHeld : Palette.padFill
        stickBase.strokeColor = controls.stickHeld ? Palette.accent : Palette.padStroke
        let travel = CGFloat(controls.pad.stickRadius - 26)
        stickKnob.position = CGPoint(x: CGFloat(controls.stickX) * travel, y: CGFloat(controls.stickY) * travel)
    }

    func setOffRoad(_ off: Bool, dt: Double) {
        let target: CGFloat = off ? 1 : 0
        vignette.alpha += (target - vignette.alpha) * CGFloat(min(1, dt * 10))
    }
}
