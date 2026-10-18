import SpriteKit

let carLength = 4.0
let carWidth = 2.0

/// Rear-wheel contact points in world space for a car pose: (left, right).
func rearWheels(x: Double, y: Double, heading: Double) -> (lx: Double, ly: Double, rx: Double, ry: Double) {
    let c = cos(heading), s = sin(heading)
    let back = -carLength * 0.38
    let half = carWidth * 0.55
    return (
        x + c * back - s * half, y + s * back + c * half,
        x + c * back + s * half, y + s * back - c * half
    )
}

private func roundedRectPath(x: CGFloat, y: CGFloat, w: CGFloat, h: CGFloat, r: CGFloat) -> CGPath {
    CGPath(roundedRect: CGRect(x: x, y: y, width: w, height: h), cornerWidth: r, cornerHeight: r, transform: nil)
}

/// Body outline: wide shoulders at the rear tapering to a rounded nose. +x is forward.
private func bodyPath() -> CGPath {
    let L = CGFloat(carLength / 2)
    let W = CGFloat(carWidth / 2)
    let nose = W * 0.72
    let p = CGMutablePath()
    p.move(to: CGPoint(x: -L + 0.3, y: -W))
    p.addLine(to: CGPoint(x: L * 0.3, y: -W))
    p.addQuadCurve(to: CGPoint(x: L - 0.2, y: -nose), control: CGPoint(x: L * 0.8, y: -W))
    p.addQuadCurve(to: CGPoint(x: L - 0.2, y: nose), control: CGPoint(x: L, y: 0))
    p.addQuadCurve(to: CGPoint(x: L * 0.3, y: W), control: CGPoint(x: L * 0.8, y: W))
    p.addLine(to: CGPoint(x: -L + 0.3, y: W))
    p.addQuadCurve(to: CGPoint(x: -L, y: W - 0.3), control: CGPoint(x: -L, y: W))
    p.addLine(to: CGPoint(x: -L, y: -W + 0.3))
    p.addQuadCurve(to: CGPoint(x: -L + 0.3, y: -W), control: CGPoint(x: -L, y: -W))
    p.closeSubpath()
    return p
}

/// The car, built from shape nodes in metres. The front wheels turn with the
/// steer, the body shifts on its wheels in a slide, and the tail lights come
/// on with the brakes.
final class CarNode: SKNode {
    let shadow = SKShapeNode(path: bodyPath())
    private let body = SKNode()
    private let frontLeft: SKShapeNode
    private let frontRight: SKShapeNode
    private let tailLeft: SKShapeNode
    private let tailRight: SKShapeNode
    private let glowLeft: SKShapeNode
    private let glowRight: SKShapeNode
    private let shell: SKShapeNode

    override init() {
        let L = CGFloat(carLength / 2)
        let W = CGFloat(carWidth / 2)

        func wheel(_ x: CGFloat, _ y: CGFloat, _ len: CGFloat) -> SKShapeNode {
            let n = SKShapeNode(path: roundedRectPath(x: -len / 2, y: -0.26, w: len, h: 0.52, r: 0.16))
            n.fillColor = Palette.carWheel
            n.strokeColor = .clear
            n.position = CGPoint(x: x, y: y)
            return n
        }
        let rearX = -L * 0.72
        let frontX = L * 0.52
        frontLeft = wheel(frontX, W * 0.98, 0.85)
        frontRight = wheel(frontX, -W * 0.98, 0.85)
        shell = SKShapeNode(path: bodyPath())
        tailLeft = SKShapeNode(rect: CGRect(x: -L + 0.05, y: W * 0.95 - 0.4, width: 0.22, height: 0.4))
        tailRight = SKShapeNode(rect: CGRect(x: -L + 0.05, y: -W * 0.95, width: 0.22, height: 0.4))
        glowLeft = SKShapeNode(circleOfRadius: 0.45)
        glowRight = SKShapeNode(circleOfRadius: 0.45)
        super.init()

        shadow.fillColor = Palette.carShadow
        shadow.strokeColor = .clear
        shadow.zPosition = -1
        // Shadow is a sibling in the world so it can sit down-screen whatever the heading

        addChild(wheel(rearX, W * 1.1, 1.0))
        addChild(wheel(rearX, -W * 1.1, 1.0))
        addChild(frontLeft)
        addChild(frontRight)
        addChild(body)

        shell.fillColor = Palette.carBody
        shell.strokeColor = Palette.carOutline
        shell.lineWidth = 0.15
        body.addChild(shell)

        let wing = SKShapeNode(path: roundedRectPath(x: -L + 0.1, y: -W * 1.05, w: 0.32, h: CGFloat(carWidth) * 1.05, r: 0.1))
        wing.fillColor = Palette.carWheel
        wing.strokeColor = .clear
        body.addChild(wing)

        let wind = CGMutablePath()
        wind.move(to: CGPoint(x: L * 0.2, y: -W * 0.74))
        wind.addLine(to: CGPoint(x: L * 0.5, y: -W * 0.56))
        wind.addLine(to: CGPoint(x: L * 0.5, y: W * 0.56))
        wind.addLine(to: CGPoint(x: L * 0.2, y: W * 0.74))
        wind.closeSubpath()
        let windscreen = SKShapeNode(path: wind)
        windscreen.fillColor = Palette.carGlass
        windscreen.strokeColor = .clear
        body.addChild(windscreen)

        let rear = CGMutablePath()
        rear.move(to: CGPoint(x: -L * 0.22, y: -W * 0.74))
        rear.addLine(to: CGPoint(x: -L * 0.42, y: -W * 0.6))
        rear.addLine(to: CGPoint(x: -L * 0.42, y: W * 0.6))
        rear.addLine(to: CGPoint(x: -L * 0.22, y: W * 0.74))
        rear.closeSubpath()
        let rearWindow = SKShapeNode(path: rear)
        rearWindow.fillColor = Palette.carGlass
        rearWindow.strokeColor = .clear
        body.addChild(rearWindow)

        let roof = SKShapeNode(rect: CGRect(x: -L * 0.22, y: -W * 0.74, width: L * 0.42, height: CGFloat(carWidth) * 0.74))
        roof.fillColor = Palette.carRoof
        roof.strokeColor = .clear
        body.addChild(roof)

        let nose = W * 0.72 - 0.15
        for y in [nose - 0.2, -nose - 0.1] {
            let lamp = SKShapeNode(rect: CGRect(x: L - 0.4, y: y, width: 0.25, height: 0.3))
            lamp.fillColor = Palette.carRoof
            lamp.strokeColor = .clear
            body.addChild(lamp)
        }

        for light in [tailLeft, tailRight] {
            light.fillColor = Palette.accent
            light.strokeColor = .clear
            body.addChild(light)
        }
        glowLeft.position = CGPoint(x: -L - 0.1, y: W * 0.95 - 0.2)
        glowRight.position = CGPoint(x: -L - 0.1, y: -W * 0.95 + 0.2)
        for glow in [glowLeft, glowRight] {
            glow.fillColor = Palette.accent
            glow.strokeColor = .clear
            glow.alpha = 0
            glow.zPosition = -0.5
            body.addChild(glow)
        }
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }

    func apply(look: CarLook) {
        let angle = CGFloat(look.steer)
        frontLeft.zRotation = angle
        frontRight.zRotation = angle
        body.position = CGPoint(x: 0, y: -CGFloat(look.roll) * 0.16)
        let lit = CGFloat(look.brake)
        tailLeft.alpha = 0.35 + 0.65 * lit
        tailRight.alpha = tailLeft.alpha
        glowLeft.alpha = lit > 0.05 ? 0.2 * lit : 0
        glowRight.alpha = glowLeft.alpha
    }

    /// Place the car and its shadow (offset down-screen) at a world pose.
    func place(x: Double, y: Double, heading: Double) {
        position = CGPoint(x: x, y: y)
        zRotation = CGFloat(heading)
        shadow.position = CGPoint(x: x + 0.2, y: y - 0.4)
        shadow.zRotation = CGFloat(heading)
    }
}
