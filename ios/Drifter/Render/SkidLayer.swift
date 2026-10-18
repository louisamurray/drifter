import SpriteKit

/// Persistent rubber. Segments are batched into shape nodes by intensity
/// bucket, a few dozen per node, so a run's worth of marks is a few hundred
/// draws at most and nothing is re-tessellated once laid. By the end of a run
/// the asphalt is a drawing of where the player drifted.
final class SkidLayer: SKNode {
    private var path = CGMutablePath()
    private var bucket = -1
    private var count = 0
    private let segmentsPerNode = 48
    private let maxNodes = 420
    private var nodes: [SKShapeNode] = []

    override init() {
        super.init()
        zPosition = 5
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }

    /// Lay a rubber segment at 0..1 intensity.
    func mark(x0: Double, y0: Double, x1: Double, y1: Double, intensity: Double) {
        guard intensity > 0.02 else { return }
        let b = min(3, Int(intensity * 3.999))
        if b != bucket || count >= segmentsPerNode {
            flush()
            bucket = b
        }
        path.move(to: CGPoint(x: x0, y: y0))
        path.addLine(to: CGPoint(x: x1, y: y1))
        count += 1
    }

    /// Commit the pending segments to a node. Call once per frame after marking.
    func flush() {
        guard count > 0 else { return }
        let node = SKShapeNode(path: path)
        node.strokeColor = Palette.skid
        node.alpha = CGFloat(Config.juice.skidAlpha) * CGFloat(bucket + 1) / 4
        node.lineWidth = CGFloat(Config.juice.skidWidth)
        node.lineCap = .round
        node.lineJoin = .round
        node.fillColor = .clear
        node.isAntialiased = true
        addChild(node)
        nodes.append(node)
        if nodes.count > maxNodes {
            nodes.removeFirst().removeFromParent()
        }
        path = CGMutablePath()
        count = 0
    }

    func clear() {
        path = CGMutablePath()
        count = 0
        bucket = -1
        for n in nodes { n.removeFromParent() }
        nodes.removeAll()
    }
}
